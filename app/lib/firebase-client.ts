"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseApp = getApps().length ? getApp() : initializeApp();

export const firebaseAuth = getAuth(firebaseApp);
