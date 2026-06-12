import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { themes } from './theme';

const ThemeContext = createContext();

export const ThemeProviderWrapper = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = localStorage.getItem('appTheme');
    return saved || 'lightIndigo';
  });

  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('appMode');
    return saved || 'light';
  });

  const [primaryColor, setPrimaryColor] = useState(() => {
    const saved = localStorage.getItem('appPrimaryColor');
    return saved || 'indigo';
  });

  useEffect(() => {
    const themeKey = `${mode}${primaryColor.charAt(0).toUpperCase() + primaryColor.slice(1)}`;
    setCurrentTheme(themeKey);
    localStorage.setItem('appTheme', themeKey);
    localStorage.setItem('appMode', mode);
    localStorage.setItem('appPrimaryColor', primaryColor);
  }, [mode, primaryColor]);

  const theme = themes[currentTheme] || themes.lightIndigo;

  const updateTheme = (newMode, newPrimaryColor) => {
    setMode(newMode);
    setPrimaryColor(newPrimaryColor);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, primaryColor, updateTheme }}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);