import { createContext, useContext } from 'react';

// Lets any screen trigger logout (App.js flips back to LoginScreen) without
// threading a prop through every stack navigator in between.
// Also exposes the current user object so any screen can read userId/name/role.
export const AuthContext = createContext({
  user: null,
  login: async () => {},
  logout: async () => {},
  isLoading: false,
});

export const useAuth = () => useContext(AuthContext);
