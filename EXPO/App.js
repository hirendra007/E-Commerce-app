import React, { useState, useEffect, useRef } from "react";
import { 
  View, Text, TextInput, Alert, TouchableOpacity, StyleSheet, ActivityIndicator 
} from "react-native";
import axios from "axios";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import * as LocalAuthentication from "expo-local-authentication"; // Added for biometric auth

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [esp32Ip, setEsp32Ip] = useState("192.168.28.246"); // Default ESP32 IP
  const [isLoading, setIsLoading] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const correctPassword = "1234"; // Change this as needed

  // Telegram Bot Details (replace with your actual values)
  const TELEGRAM_BOT_TOKEN = "7639963161:AAHj4OwWtTkJO5Odw8TvndeKoAOZTjN4VaI";  // Replace with your bot token
  const TELEGRAM_CHAT_ID = "-4636944807";
  

  // Fall detection state
  const [fallDetected, setFallDetected] = useState(false);
  
  // Overspeeding detection state
  const [speed, setSpeed] = useState(0);
  const speedLimit = 80; // Speed limit in km/h

  // Ref for filtered acceleration
  const filteredAccelerationRef = useRef(0);
  // Refs for previous location and timestamp (for speed calculation)
  const previousLocationRef = useRef(null);
  const previousTimestampRef = useRef(null);
  // Ref for Kalman filter state for speed estimation
  const kalmanSpeedRef = useRef({ estimate: 0, error: 1 });

  // Simple Kalman filter update function
  const kalmanUpdate = (z, prevEstimate, prevError, Q = 0.1, R = 1) => {
    // Prediction
    const predictedEstimate = prevEstimate;
    const predictedError = prevError + Q;
    // Measurement update
    const K = predictedError / (predictedError + R);
    const updatedEstimate = predictedEstimate + K * (z - predictedEstimate);
    const updatedError = (1 - K) * predictedError;
    return { estimate: updatedEstimate, error: updatedError };
  };

  // CONNECT TO ESP32
  const connectToESP32 = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`http://${esp32Ip}/ping`, { timeout: 3000 });
      if (response.status === 200) {
        setIsConnected(true);
        Alert.alert("Connected", "Successfully connected to ESP32");
      }
    } catch (error) {
      console.error("Connection failed:", error);
      Alert.alert("Connection Failed", "Could not connect to ESP32. Check IP address and make sure ESP32 is powered on.");
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Test Mode
  const toggleTestMode = () => {
    setTestMode(!testMode);
    if (!testMode) {
      Alert.alert(
        "Test Mode Enabled", 
        "Start button is now active regardless of ESP32 connection. Use this mode to test app features."
      );
    } else {
      Alert.alert("Test Mode Disabled", "Normal operation resumed.");
    }
  };

  const handleStart = () => {
    setScreen("main");
    handlePasswordStart();
  };

  // Authenticate using fingerprint; if it fails, fallback to password
  const handlePasswordSubmit = async () => {
    try {
      if (password === correctPassword) {
        setStep(1);
      } else {
        Alert.alert("Incorrect Password", "Try again");
      }
    } catch (error) {
      console.error("Authentication error:", error);
      Alert.alert("Authentication Error", "An error occurred during authentication. Try again.");
    }
  };

  const handlePasswordStart = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const biometricResult = await LocalAuthentication.authenticateAsync({
          promptMessage: "Authenticate using Biometrics"
        });
        if (biometricResult.success) {
          setStep(1);
          return;
        } else {
          if (password === correctPassword) {
            setStep(1);
          } else {
            Alert.alert("Authentication Failed", "Fingerprint failed and password is incorrect. Try again.");
          }
        }
      }
    } catch (error) {
      console.error("Authentication error:", error);
      Alert.alert("Authentication Error", "An error occurred during authentication. Try again.");
    }
  };

  // When safety checks pass, ignite the bike via ESP32 ignition endpoint
  const handleManualNextStep = () => {
    if (step < 3) {
      setStep(step+1);
    } else {
      igniteBike();
    }
  };

  // Sends a POST request to ignite the bike (unlock engine)
  const igniteBike = async () => {
    try {
      if(testMode){
        Alert.alert("Bike Ignited", "Your bike is now running.");
      } else {
        await axios.post(`http://${esp32Ip}/ignition`, { state: "on" });
        Alert.alert("Bike Ignited", "Your bike is now running.");
      }
    } catch (error) {
      console.error("Ignition failed:", error);
      Alert.alert("Ignition Failed", "Failed to ignite bike. Please try again.");
    }
  };

  // Poll ESP32 for safety checks (helmet and alcohol)
  useEffect(() => {
    let interval;
    if (step > 0 && step < 3 && isConnected) {
      interval = setInterval(async () => {
        try {
          const response = await axios.get(`http://${esp32Ip}/status`);
          const status = response.data;
          console.log("Received status:", status);
          // Helmet check
          if (status.helmetWorn && step === 1) {
            setStep(2);
            Alert.alert("Helmet Detected", "Helmet is being worn correctly");
          }
          // Alcohol check
          if (status.alcoholCheckPassed && step === 2) {
            setStep(3);
            Alert.alert("Safety Check Complete", "Alcohol test passed");
          }
        } catch (error) {
          console.error("Error fetching ESP32 status:", error);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, isConnected, esp32Ip]);

  // Fall Detection using Accelerometer (with filtering to reduce false triggers)
  useEffect(() => {
    const alpha = 0.8; // Smoothing factor for low-pass filter
    const threshold = 0.1; // Adjust sensitivity if needed
    const fallSubscription = Accelerometer.addListener(({ x, y, z }) => {
      const rawAcceleration = Math.sqrt(x * x + y * y + z * z);
      const previousFiltered = filteredAccelerationRef.current || rawAcceleration;
      const filteredAcceleration = alpha * rawAcceleration + (1 - alpha) * previousFiltered;
      filteredAccelerationRef.current = filteredAcceleration;
      if (!testMode && filteredAcceleration < threshold) {
        setFallDetected(true);
        Alert.alert("🚨 Fall Detected", "Sending location...");
        sendLocation();
      }
    });
    return () => fallSubscription && fallSubscription.remove();
  }, [testMode]);

  // Overspeeding Detection using GPS with speed smoothing via Haversine calculation and Kalman filtering
  useEffect(() => {
    const speedSubscription = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 1 },
      (location) => {
        const { latitude, longitude, speed: gpsSpeed } = location.coords;
        const currentTimestamp = new Date(location.timestamp);
        let computedSpeed = gpsSpeed ? gpsSpeed * 3.6 : 0;

        /*if (previousLocationRef.current && previousTimestampRef.current) {
          computedSpeed = computeSpeed(
            previousLocationRef.current,
            previousTimestampRef.current,
            { latitude, longitude },
            currentTimestamp
          );
        } else {
          computedSpeed = gpsSpeed ? gpsSpeed * 3.6 : 0;
        }*/

        // Update previous location and timestamp
        previousLocationRef.current = { latitude, longitude };
        previousTimestampRef.current = currentTimestamp;

        // Kalman filter update to smooth computed speed
        const kalmanResult = kalmanUpdate(
          computedSpeed,
          kalmanSpeedRef.current.estimate,
          kalmanSpeedRef.current.error
        );
        kalmanSpeedRef.current = kalmanResult;
        const filteredSpeed = kalmanResult.estimate;

        setSpeed(prevSpeed => prevSpeed ? prevSpeed * 0.8 + filteredSpeed * 0.2 : filteredSpeed);

        if (!testMode && filteredSpeed > speedLimit) {
          Alert.alert("⚠️ Overspeeding Detected", `You're driving at ${Math.round(filteredSpeed)} km/h!`);
          sendSpeedAlert(filteredSpeed);
        }
      }
    );
    return () => speedSubscription.then(sub => sub.remove());
  }, [testMode]);

  // Haversine function to calculate distance between two lat/lng points in meters
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Compute speed based on previous and current GPS data
  const computeSpeed = (prevLoc, prevTime, currentLoc, currentTime) => {
    const distance = haversineDistance(
      prevLoc.latitude,
      prevLoc.longitude,
      currentLoc.latitude,
      currentLoc.longitude
    );
    const timeDiff = (currentTime - prevTime) / 1000; // seconds
    if (timeDiff === 0) return 0;
    const speedMps = distance / timeDiff; // meters per second
    return speedMps * 3.6; // km/h
  };

  // Send location via Telegram on fall detection
  const sendLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Cannot access location");
      return;
    }
    let location = await Location.getCurrentPositionAsync({});
    const message = `🚨 Fall Detected!\nLocation: https://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
  };

  // Send overspeeding alert via Telegram
  const sendSpeedAlert = async (currentSpeed) => {
    const message = `⚠️ Overspeeding Alert!\nCurrent Speed: ${Math.round(currentSpeed)} km/h\nPlease slow down!`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.gradientBackground} />
      {screen === "landing" ? (
        <View style={styles.centeredContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Smart Helmet System</Text>
            <View style={styles.underline} />
          </View>
          
          <View style={styles.speedContainer}>
            <Text style={styles.speedText}>Speed: {Math.round(speed)} km/h</Text>
            <View style={styles.speedIndicator}>
              <View style={[
                styles.speedFill, 
                { width: `${Math.min(Math.round(speed), 120)}%` }
              ]} />
            </View>
          </View>
          
          {testMode && (
            <View style={styles.testModeIndicator}>
              <Text style={styles.testModeText}>TEST MODE ACTIVE</Text>
            </View>
          )}
          
          <View style={styles.ipInputContainer}>
            <Text style={styles.text}>ESP32 IP Address:</Text>
            <TextInput
              style={styles.input}
              value={esp32Ip}
              onChangeText={setEsp32Ip}
              placeholder="192.168.1.100"
              keyboardType="numeric"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity
              style={[styles.button, isConnected ? styles.successButton : null]}
              onPress={connectToESP32}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>
                  {isConnected ? "Connected" : "Connect to ESP32"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={[styles.button, (!isConnected && !testMode) ? styles.disabledButton : styles.primaryButton]} 
            onPress={handleStart}
            disabled={!isConnected && !testMode}
          >
            <Text style={styles.buttonText}>Start</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.testModeButton, testMode ? styles.testModeActiveButton : null]} 
            onPress={toggleTestMode}
          >
            <Text style={testMode ? styles.testModeActiveText : styles.testModeButtonText}>
              {testMode ? "Disable Test Mode" : "Enable Test Mode"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.centeredContent}>
          {testMode && (
            <View style={styles.testModeIndicator}>
              <Text style={styles.testModeText}>TEST MODE ACTIVE</Text>
            </View>
          )}
          {step === 0 && (
            <View style={styles.stepContainer}>
              <Text style={styles.headerText}>Enter Password:</Text>
              <TextInput
                style={styles.passwordInput}
                secureTextEntry
                onChangeText={setPassword}
                value={password}
              />
              <TouchableOpacity style={styles.button} onPress={handlePasswordSubmit}>
                <Text style={styles.buttonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 1 && (
            <View style={[styles.stepContainer, styles.helmetStepContainer]}>
              <View style={styles.stepIconContainer}>
                <View style={styles.helmetIcon} />
              </View>
              <Text style={styles.headerText}>Waiting for helmet to be worn...</Text>
              <Text style={styles.subText}>
                {isConnected ? "Receiving signals from ESP32..." : "Test mode: ESP32 not connected"}
              </Text>
              <TouchableOpacity style={styles.buttonOutline} onPress={handleManualNextStep}>
                <Text style={styles.buttonOutlineText}>Manual Override (For Testing)</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 2 && (
            <View style={[styles.stepContainer, styles.alcoholStepContainer]}>
              <View style={styles.stepIconContainer}>
                <View style={styles.sensorIcon} />
              </View>
              <Text style={styles.headerText}>Checking for alcohol...</Text>
              <Text style={styles.subText}>
                {isConnected ? "Receiving signals from ESP32..." : "Test mode: ESP32 not connected"}
              </Text>
              <TouchableOpacity style={styles.buttonOutline} onPress={handleManualNextStep}>
                <Text style={styles.buttonOutlineText}>Manual Override (For Testing)</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 3 && (
            <View style={[styles.stepContainer, styles.successStepContainer]}>
              <View style={styles.successIcon} />
              <Text style={styles.successText}>All safety checks passed!</Text>
              <TouchableOpacity style={styles.startButton} onPress={handleManualNextStep}>
                <Text style={styles.buttonText}>Ignite Bike</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => {
              setScreen("landing");
              setStep(0);
            }}
          >
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
  
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    padding: 20,
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#001e3c',
    borderWidth: 4,
    borderRadius: 0,
    borderColor: '#001e3c',
    shadowColor: '#1565c0',
    shadowOffset: { width: -10, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  centeredContent: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#1565c0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 15,
    borderWidth: 1,
    borderColor: "#f0f0f0"
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: { 
    fontSize: 32, 
    fontWeight: "bold", 
    marginBottom: 5,
    color: "#1565c0",
    textAlign: "center",
    textShadowColor: 'rgba(21, 101, 192, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3
  },
  underline: {
    height: 4,
    width: 80,
    backgroundColor: "#ff6e40",
    borderRadius: 2,
  },
  text: { 
    fontSize: 18, 
    marginBottom: 10,
    textAlign: "center",
    color: "#455a64",
    fontWeight: "500"
  },
  headerText: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
    color: "#263238"
  },
  speedContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  speedText: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#fff",
    backgroundColor: "#1565c0",
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 50,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5
  },
  speedIndicator: {
    height: 6,
    width: "80%",
    backgroundColor: "#e0e0e0",
    borderRadius: 3,
    overflow: "hidden",
  },
  speedFill: {
    height: "100%",
    backgroundColor: "#1565c0",
    borderRadius: 3,
  },
  subText: {
    fontSize: 16,
    color: "#546e7a",
    marginBottom: 24,
    textAlign: "center",
    fontStyle: "italic"
  },
  successText: {
    fontSize: 26,
    fontWeight: "bold",
    marginVertical: 24,
    textAlign: "center",
    color: "#2e7d32",
    textShadowColor: 'rgba(46, 125, 50, 0.3)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2
  },
  ipInputContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 24
  },
  input: { 
    width: 280, 
    borderWidth: 1, 
    padding: 14, 
    marginBottom: 16, 
    borderRadius: 12,
    backgroundColor: "white",
    borderColor: "#bbdefb",
    fontSize: 16,
    color: "#333",
    shadowColor: "#1565c0",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  passwordInput: {
    width: 280, 
    borderWidth: 1, 
    padding: 14, 
    marginBottom: 16, 
    borderRadius: 12,
    backgroundColor: "white",
    borderColor: "#bbdefb",
    fontSize: 18,
    letterSpacing: 2,
    color: "#333",
    textAlign: "center",
    shadowColor: "#1565c0",
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  button: { 
    backgroundColor: "#1565c0", 
    padding: 15, 
    borderRadius: 12, 
    marginTop: 10,
    width: 280,
    alignItems: "center",
    shadowColor: "#002f6c",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6
  },
  primaryButton: {
    backgroundColor: "#ff6e40",
    shadowColor: "#c41c00",
  },
  buttonText: { 
    color: "white", 
    fontSize: 18,
    fontWeight: "600" 
  },
  buttonOutline: {
    borderColor: "#1565c0",
    borderWidth: 2,
    backgroundColor: "rgba(21, 101, 192, 0.05)",
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    width: 280,
    alignItems: "center"
  },
  buttonOutlineText: {
    color: "#1565c0",
    fontSize: 16,
    fontWeight: "600"
  },
  backButton: {
    marginTop: 30,
    padding: 12,
    backgroundColor: "rgba(66, 66, 66, 0.1)",
    borderRadius: 10,
    width: 150,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(66, 66, 66, 0.2)"
  },
  backButtonText: {
    color: "#455a64",
    fontSize: 14,
    fontWeight: "600"
  },
  successButton: {
    backgroundColor: "#2e7d32",
    shadowColor: "#005005",
  },
  startButton: {
    backgroundColor: "#2e7d32",
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
    width: 280,
    alignItems: "center",
    shadowColor: "#005005",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6
  },
  disabledButton: {
    backgroundColor: "#90a4ae",
    shadowColor: "#62757f",
  },
  testModeButton: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ff9800",
    width: 280,
    alignItems: "center",
    backgroundColor: "rgba(255, 152, 0, 0.05)"
  },
  testModeButtonText: {
    color: "#ff9800",
    fontWeight: "600",
    fontSize: 16
  },
  testModeActiveButton: {
    backgroundColor: "#ff9800",
    shadowColor: "#c66900",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4
  },
  testModeActiveText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16
  },
  testModeIndicator: {
    backgroundColor: "#ff9800",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    width: 280,
    alignItems: "center",
    shadowColor: "#c66900",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4
  },
  testModeText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16
  },
  stepContainer: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "rgba(250, 250, 250, 0.95)",
    borderRadius: 16,
    padding: 24,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#1565c0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8
  },
  helmetStepContainer: {
    borderLeftWidth: 5,
    borderLeftColor: "#42a5f5"
  },
  alcoholStepContainer: {
    borderLeftWidth: 5,
    borderLeftColor: "#7e57c2"
  },
  successStepContainer: {
    borderLeftWidth: 5,
    borderLeftColor: "#66bb6a",
    backgroundColor: "rgba(232, 245, 233, 0.95)"
  },
  stepIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e3f2fd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#1565c0",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  },
  helmetIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#42a5f5"
  },
  sensorIcon: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: "#7e57c2"
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e8f5e9",
    borderWidth: 3,
    borderColor: "#66bb6a",
    marginBottom: 10,
    shadowColor: "#2e7d32",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  }
});
