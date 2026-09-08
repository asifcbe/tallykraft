import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { themes } from './theme';

const ThemeContext = createContext();

export const ThemeProviderWrapper = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = localStorage.getItem('tallykraft_appTheme');
    return saved || 'lightIndigo';
  });

  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('tallykraft_appMode');
    return saved || 'light';
  });

  const [primaryColor, setPrimaryColor] = useState(() => {
    const saved = localStorage.getItem('tallykraft_appPrimaryColor');
    return saved || 'indigo';
  });

  useEffect(() => {
    const themeKey = `${mode}${primaryColor.charAt(0).toUpperCase() + primaryColor.slice(1)}`;
    setCurrentTheme(themeKey);
    localStorage.setItem('tallykraft_appTheme', themeKey);
    localStorage.setItem('tallykraft_appMode', mode);
    localStorage.setItem('tallykraft_appPrimaryColor', primaryColor);
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