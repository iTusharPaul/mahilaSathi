import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserDTO } from '@nightwise/shared';
import { api } from './api.js';
import { nexconnEngine, ConnectionState } from '../nexconn/index.js';

interface AuthContextType {
  user: UserDTO | null;
  jwt: string | null;
  nexconnToken: string | null;
  connectionState: ConnectionState;
  loading: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => void;
  updateHandle: (newHandle: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [nexconnToken, setNexconnToken] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Nexconn engine connection state changes
    const unsub = nexconnEngine.onStatusChange((state) => {
      setConnectionState(state);
    });

    // Restore saved session
    const savedJwt = localStorage.getItem('nw_jwt');
    const savedUser = localStorage.getItem('nw_user');
    const savedToken = localStorage.getItem('nw_nexconn_token');

    if (savedJwt && savedUser) {
      try {
        const parsedUser: UserDTO = JSON.parse(savedUser);
        setUser(parsedUser);
        setJwt(savedJwt);
        setNexconnToken(savedToken);

        // Verify with backend
        api.getMe()
          .then(({ user: freshUser }) => {
            setUser(freshUser);
            localStorage.setItem('nw_user', JSON.stringify(freshUser));
          })
          .catch(() => {
            // invalid session
            logout();
          });

        if (savedToken) {
          nexconnEngine.connect(savedToken, parsedUser.id);
        }
      } catch {
        logout();
      }
    }
    setLoading(false);

    return () => {
      unsub();
    };
  }, []);

  const login = async (phone: string, code: string) => {
    const res = await api.verifyOtp(phone, code);
    setUser(res.user);
    setJwt(res.jwt);
    setNexconnToken(res.nexconnToken);

    localStorage.setItem('nw_jwt', res.jwt);
    localStorage.setItem('nw_user', JSON.stringify(res.user));
    localStorage.setItem('nw_nexconn_token', res.nexconnToken);

    // Connect to Nexconn SDK
    await nexconnEngine.connect(res.nexconnToken, res.user.id);
  };

  const logout = () => {
    nexconnEngine.disconnect();
    setUser(null);
    setJwt(null);
    setNexconnToken(null);
    localStorage.removeItem('nw_jwt');
    localStorage.removeItem('nw_user');
    localStorage.removeItem('nw_nexconn_token');
  };

  const updateHandle = async (newHandle: string) => {
    const res = await api.updateHandle(newHandle);
    setUser(res.user);
    setJwt(res.jwt);
    localStorage.setItem('nw_user', JSON.stringify(res.user));
    localStorage.setItem('nw_jwt', res.jwt);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        jwt,
        nexconnToken,
        connectionState,
        loading,
        login,
        logout,
        updateHandle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
