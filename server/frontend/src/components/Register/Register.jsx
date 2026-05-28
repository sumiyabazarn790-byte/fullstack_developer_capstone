import React, { useState } from 'react';

import "./Register.css";
import Header from '../Header/Header';
import person from "../assets/person.png";
import emailIcon from "../assets/email.png";
import passwordIcon from "../assets/password.png";
import passwordConfirmIcon from "../assets/password confirm.png";

const Register = () => {
  const [userName, setUserName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const register = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    const res = await fetch(window.location.origin + "/djangoapp/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userName,
        firstName,
        lastName,
        email,
        password,
      }),
    });

    const json = await res.json();
    if (json.status === "Registered") {
      sessionStorage.setItem("username", json.userName);
      sessionStorage.setItem("firstname", json.firstName);
      sessionStorage.setItem("lastname", json.lastName);
      window.location.href = "/";
    } else {
      alert(json.error || "Registration failed.");
    }
  };

  return (
    <div>
      <Header />
      <form className="register_container" onSubmit={register}>
        <div className="header">Sign Up</div>
        <div className="inputs">
          <div className="input">
            <img src={person} className="img_icon" alt="Username" />
            <input type="text" className="input_field" placeholder="Username" required onChange={(e) => setUserName(e.target.value)} />
          </div>
          <div className="input">
            <img src={person} className="img_icon" alt="First name" />
            <input type="text" className="input_field" placeholder="First Name" required onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="input">
            <img src={person} className="img_icon" alt="Last name" />
            <input type="text" className="input_field" placeholder="Last Name" required onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="input">
            <img src={emailIcon} className="img_icon" alt="Email" />
            <input type="email" className="input_field" placeholder="Email" required onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="input">
            <img src={passwordIcon} className="img_icon" alt="Password" />
            <input type="password" className="input_field" placeholder="Password" required onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="input">
            <img src={passwordConfirmIcon} className="img_icon" alt="Confirm password" />
            <input type="password" className="input_field" placeholder="Confirm Password" required onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div className="submit_panel">
          <input className="submit" type="submit" value="Register" />
          <a className="loginlink" href="/login">Already registered? Login</a>
        </div>
      </form>
    </div>
  );
};

export default Register;
