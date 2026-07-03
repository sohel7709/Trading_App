import { createContext, useContext } from 'react';

// Lets any screen trigger logout (App.js flips back to LoginScreen) without
// threading a prop through every stack navigator in between.
export const AuthContext = createContext({ logout: () => {} });

export const useAuth = () => useContext(AuthContext);
