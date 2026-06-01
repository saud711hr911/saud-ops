/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInAnonymously,
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, UserRole, Locale } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  loading: boolean;
  locale: Locale;
  setLocale: (lang: Locale) => void;
  setDemoRole: (role: UserRole) => void;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  isDemoMode: boolean;
  setDemoUser: (role: UserRole, email?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('client');
  const [loading, setLoading] = useState<boolean>(true);
  const [locale, setLocaleState] = useState<Locale>('ar'); // Default to Arabic RTL layout
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Initialize Language from localStorage
  useEffect(() => {
    const savedLang = localStorage.getItem('ops_center_lang') as Locale;
    if (savedLang === 'ar' || savedLang === 'en') {
      setLocaleState(savedLang);
    }
  }, []);

  const setLocale = (lang: Locale) => {
    setLocaleState(lang);
    localStorage.setItem('ops_center_lang', lang);
  };

  // Sync real Firebase Auth
  useEffect(() => {
    if (isDemoMode) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            setProfile(data);
            setRole(data.role);
          } else {
            // New user, let's provision them!
            // If user's email is our bootstrapped admin, grant admin status. Otherwise, default to client.
            const isBootstrappedAdmin = firebaseUser.email === 'saud711hr@gmail.com';
            const initialRole: UserRole = isBootstrappedAdmin ? 'admin' : 'client';

            const newProfile: UserProfile = {
              userId: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown User',
              email: firebaseUser.email || '',
              role: initialRole,
              company: initialRole === 'client' ? 'Saudi Trading Corp' : undefined,
              createdAt: new Date().toISOString()
            };

            await setDoc(userDocRef, {
              ...newProfile,
              createdAt: serverTimestamp() // Database-level server timestamp
            });

            setProfile(newProfile);
            setRole(initialRole);
          }
        } catch (err) {
          console.error("Error reading or writing user profile:", err);
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole('client');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isDemoMode]);

  // Demo User simulation triggers (perfect for quick walkthrough evaluations)
  const setDemoUser = async (simulatorRole: UserRole, emailOverride?: string) => {
    setLoading(true);
    setIsDemoMode(true);

    const email = emailOverride || (
      simulatorRole === 'admin' ? 'saud711hr@gmail.com' : 
      simulatorRole === 'employee' ? 'sarah.engineer@operations.com' : 
      'ali.client@sauditrading.com'
    );

    const mockUser: any = {
      uid: `demo_user_${simulatorRole}`,
      displayName: simulatorRole === 'admin' ? 'Saud Al-Qahtani' : simulatorRole === 'employee' ? 'Sarah Ahmed' : 'Ali Mansour',
      email: email,
      emailVerified: true,
      providerData: [],
    };

    const mockProfile: UserProfile = {
      userId: mockUser.uid,
      name: mockUser.displayName,
      email: mockUser.email,
      role: simulatorRole,
      company: simulatorRole === 'client' ? 'Saudi Trading Corp' : undefined,
      createdAt: new Date().toISOString()
    };

    setUser(mockUser);
    setProfile(mockProfile);
    setRole(simulatorRole);
    setLoading(false);
  };

  // Switch role inside active authentication session (extremely convenient)
  const setDemoRole = (newRole: UserRole) => {
    setRole(newRole);
    if (profile) {
      setProfile({
        ...profile,
        role: newRole
      });
    }
  };

  const loginWithGoogle = async () => {
    setIsDemoMode(false);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Error signing in with Google:", err);
      setLoading(false);
    }
  };

  const logoutUser = async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setUser(null);
      setProfile(null);
      setRole('client');
    } else {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Error signing out:", err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role,
      loading,
      locale,
      setLocale,
      setDemoRole,
      loginWithGoogle,
      logoutUser,
      isDemoMode,
      setDemoUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used inside a FirebaseProvider');
  }
  return context;
};
