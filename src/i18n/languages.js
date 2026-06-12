// Supported languages. English is the default and the fallback for any key that
// hasn't been translated yet in another language.
export const LANGUAGES = [
  { code: 'en', label: 'English',  native: 'English' },
  { code: 'hi', label: 'Hindi',    native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali',  native: 'বাংলা' },
  { code: 'ta', label: 'Tamil',    native: 'தமிழ்' },
  { code: 'te', label: 'Telugu',   native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi',  native: 'मराठी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada',  native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam',native: 'മലയാളം' },
  { code: 'or', label: 'Odia',     native: 'ଓଡ଼ିଆ' },
  { code: 'pa', label: 'Punjabi',  native: 'ਪੰਜਾਬੀ' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
  { code: 'mni', label: 'Manipuri',native: 'মেইতেই' },
  { code: 'kok', label: 'Konkani', native: 'कोंकणी' },
  { code: 'ne', label: 'Nepali',   native: 'नेपाली' },
  { code: 'ur', label: 'Urdu',     native: 'اردو' },
];

export const DEFAULT_LANG = 'en';
export const isRTL = (code) => code === 'ur';
