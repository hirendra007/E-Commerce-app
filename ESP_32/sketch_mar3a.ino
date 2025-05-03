#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "hirendra007";
const char* password = "123456789";

// Web server on port 80
WebServer server(80);

// Sensor Pins
const int HELMET_SENSOR_PIN = 34;  // IR Sensor (Helmet detection)
const int ALCOHOL_SENSOR_PIN = 35; // MQ-3 Alcohol Sensor
const int BUZZER_PIN = 18;         // Buzzer pin
const int RELAY_PIN = 19;          // Relay (Engine lock)

// Sensor status variables
bool helmetWorn = false;
bool alcoholCheckPassed = false;

// Manual ignition flag: when true, sensor logic does not override the relay state.
bool manualIgnition = false;

void setup() {
    Serial.begin(115200);
    delay(100);

    pinMode(HELMET_SENSOR_PIN, INPUT);
    pinMode(ALCOHOL_SENSOR_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(RELAY_PIN, OUTPUT);   // Relay to control engine

    connectToWiFi();

    server.on("/ping", handlePing);
    server.on("/status", handleStatus);
    // New ignition endpoint: expects a POST with parameter "state" ("on" or "off")
    server.on("/ignition", HTTP_POST, handleIgnition);

    server.begin();
    Serial.println("HTTP server started.");
}

void loop() {
    server.handleClient();
    readSensors();
    controlEngine();
    alertBuzzer();
    delay(500);
}

// Connect ESP32 to WiFi
void connectToWiFi() {
    Serial.println("Connecting to WiFi...");
    WiFi.begin(ssid, password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi Connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\nWiFi connection failed! Restarting...");
        ESP.restart();
    }
}

// Read sensors and update status variables
void readSensors() {
    int helmetSensorValue = digitalRead(HELMET_SENSOR_PIN); // IR Sensor (Digital output)
    int alcoholSensorValue = analogRead(ALCOHOL_SENSOR_PIN);

    // For the IR sensor, assume LOW means helmet detected
    helmetWorn = (helmetSensorValue == LOW);
    // Adjust the threshold as needed for the MQ-3 sensor
    alcoholCheckPassed = (alcoholSensorValue < 3000);

    Serial.print("Helmet: ");
    Serial.print(helmetWorn ? "Worn " : "Not Worn ");
    Serial.print(" | Alcohol: ");
    Serial.print(alcoholCheckPassed ? "Safe " : "Alcohol Detected ");
    Serial.print(" | Alcohol Value: ");
    Serial.println(alcoholSensorValue);
}

// Control Engine Locking (Relay)
// When manual ignition is active, do not override the relay state.
void controlEngine() {
    if (manualIgnition) {
        digitalWrite(RELAY_PIN, HIGH); // Maintain manual override (Engine remains unlocked)
        Serial.println("Manual ignition active: Engine remains Unlocked (Relay HIGH)");
    } 
}

// Activate buzzer if helmet is not worn or alcohol is detected
void alertBuzzer() {
    if (!helmetWorn || !alcoholCheckPassed) {
        Serial.println("⚠️ ALERT: Buzzer ON (Helmet missing or Alcohol detected)");
        digitalWrite(BUZZER_PIN, HIGH);
        delay(500);
        digitalWrite(BUZZER_PIN, LOW);
        delay(500);
    } else {
        digitalWrite(BUZZER_PIN, LOW);
    }
}

// API Endpoint: Check if server is running
void handlePing() {
    server.send(200, "text/plain", "ESP32 Smart Helmet Server is running");
}

// API Endpoint: Send sensor status
void handleStatus() {
    StaticJsonDocument<200> doc;
    doc["helmetWorn"] = helmetWorn;
    doc["alcoholCheckPassed"] = alcoholCheckPassed;
    // Engine status now reflects manual override if active
    doc["engineStatus"] = manualIgnition ? "Unlocked (Manual)" : (helmetWorn && alcoholCheckPassed ? "Unlocked" : "Locked");
    doc["manualIgnition"] = manualIgnition ? "Active" : "Inactive";
    doc["helmetSensorValue"] = digitalRead(HELMET_SENSOR_PIN);
    doc["alcoholSensorValue"] = analogRead(ALCOHOL_SENSOR_PIN);

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

// API Endpoint: Handle ignition commands
void handleIgnition() {
    String state = "";
    // First, check if "state" parameter is available as an argument
    if (server.hasArg("state")) {
        state = server.arg("state");
    }
    // If not, try reading from the POST body (plain text)
    else if (server.hasArg("plain")) {
        String body = server.arg("plain");
        StaticJsonDocument<100> doc;
        DeserializationError error = deserializeJson(doc, body);
        if (!error) {
            state = doc["state"].as<String>();
        }
    }

    if (state.length() > 0) {
        if (state == "on") {
            manualIgnition = true;
            digitalWrite(RELAY_PIN, HIGH);  // Activate relay (engine unlocked)
            Serial.println("Ignition command: ON (Manual override active)");
            server.send(200, "text/plain", "Ignition ON");
        } else if (state == "off") {
            manualIgnition = false;
            // After turning off manual override, apply sensor-based control immediately
            if (helmetWorn && alcoholCheckPassed) {
                digitalWrite(RELAY_PIN, HIGH);
            } else {
                digitalWrite(RELAY_PIN, LOW);
            }
            Serial.println("Ignition command: OFF (Manual override cleared)");
            server.send(200, "text/plain", "Ignition OFF");
        } else {
            server.send(400, "text/plain", "Invalid state parameter");
        }
    } else {
        server.send(400, "text/plain", "Missing 'state' parameter");
    }
}
