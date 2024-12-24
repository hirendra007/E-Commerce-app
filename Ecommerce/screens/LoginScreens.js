import { StyleSheet, Text, View, SafeAreaView, Image, KeyboardAvoidingView, TextInput, Pressable, } from 'react-native'
import React, { useEffect, useState  } from 'react'
import Fontisto from '@expo/vector-icons/Fontisto';
import AntDesign from '@expo/vector-icons/AntDesign';
import { useNavigation} from "@react-navigation/native"

const LoginScreens = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigation=useNavigation();
  return (
    <SafeAreaView style={styles.container}>
      <View>
        <Image
          style={{ width: 150, height: 100 }}
          source={require("../assets/amazon.png")}
        />
      </View>
      <KeyboardAvoidingView>
        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 25,
              fontWeight: "bold",
              marginTop: 12,
              color: "#041E42",
            }}
          >
            Login in to your Account
          </Text>
        </View>
        <View style={{
          marginTop: 70
        }}>
          <View style={styles.text}>
            <Fontisto name="email" size={24} color="black" />
            <TextInput value={email} onChangeText={(text) => setEmail(text)} placeholder='Enter your email' style={{
              marginVertical: 5,
              width: 300,
              fontSize: 16,
            }}></TextInput>
          </View>
          <View style={styles.text}>
            <AntDesign name="lock" size={24} color="black" />
            <TextInput value={password} onChangeText={(text) => setPassword(text)}
              secureTextEntry={true}
              placeholder='Enter your password' style={{
                marginVertical: 5,
                width: 300,
                fontSize: 16,
              }}></TextInput>
          </View>
          <View style={styles.recovery}>
            <Text style={{ fontSize: 16 }}>Keep me logged in</Text>
            <Text style={{ color: '#007FFF', fontSize: 16, fontWeight: 500 }}>Forgot Password</Text>
          </View>
          <View style={{ margin: 100 }}>
            <Pressable style={styles.button}>
              <Text style={{
                textAlign: "center",
                color: "white",
                fontSize: 16,
                fontWeight: "bold",
              }}>Login</Text>
            </Pressable>
            <Pressable onPress={()=>{
              navigation.navigate('Register')
            }} style={styles.register}>
              <Text style={{
                textAlign: "center",
                color: "grey",
                fontSize: 16,
                fontWeight: 300
              }}>Don't have an Account? Sign up</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default LoginScreens;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'white',
    paddingTop: 60
  },
  text: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#989898',
    paddingVertical: 5,
    marginTop: 30,
    marginHorizontal: 30,
    paddingLeft: 10,
    borderRadius: 5,
    overflow: 'scroll'
  },
  recovery: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    justifyContent: 'space-around',
    gap: 40,
  },
  button: {
    width: 200,
    backgroundColor: "#FEBE10",
    borderRadius: 6,
    marginLeft: "auto",
    marginRight: "auto",
    padding: 15,
  },
  register: {
    marginTop: 10
  }
})