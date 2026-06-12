import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';

const FinancialYearContext = createContext();

const pad = (n) => String(n).padStart(2, '0');

// Local-timezone today string YYYY-MM-DD — avoids toISOString() UTC shift
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Purely string-based FY computation — no toISOString() so no timezone drift
export function getFYForDate(dateStr, fyStartMonth) {
  // Parse YYYY-MM-DD directly, no Date timezone conversion
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed

  const fyStartYear = month >= fyStartMonth ? year : year - 1;
  const fyEndYear = fyStartMonth === 0 ? fyStartYear : fyStartYear + 1;

  const start = `${fyStartYear}-${pad(fyStartMonth + 1)}-01`;

  // End = last day of the month immediately before fyStartMonth
  // For fyStartMonth=0 (Jan): end = Dec 31 of fyStartYear
  // For others: end = last day of (fyStartMonth-1) of fyEndYear
  const endMonth0 = fyStartMonth === 0 ? 11 : fyStartMonth - 1; // 0-indexed
  const endYear = fyStartMonth === 0 ? fyStartYear : fyEndYear;
  // new Date(y, m+1, 0) gives last day of month m in year y — purely local, no UTC export
  const lastDay = new Date(endYear, endMonth0 + 1, 0).getDate();
  const end = `${endYear}-${pad(endMonth0 + 1)}-${pad(lastDay)}`;

  const label = fyStartMonth === 0
    ? `CY ${fyStartYear}`
    : `FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`;

  return { label, start, end };
}

// Advance start string by exactly one year — pure string math, no timezone
const advanceFYStart = (fyStart, fyStartMonth) => {
  const year = parseInt(fyStart.split('-')[0], 10) + 1;
  return `${year}-${pad(fyStartMonth + 1)}-01`;
};

export const FinancialYearProvider = ({ children }) => {
  const { data } = useData();
  const { currentBusiness } = useBusiness();
  const fyStartMonth = currentBusiness?.fyStartMonth ?? 3;

  const currentFY = useMemo(
    () => getFYForDate(localToday(), fyStartMonth),
    [fyStartMonth]
  );

  const storageKey = `activeFY_${currentBusiness?.id}`;

  const [activeFYLabel, setActiveFYLabelState] = useState(() =>
    localStorage.getItem(
      `activeFY_${Number(localStorage.getItem('currentBusinessId')) || 1}`
    ) || null
  );

  // Resync when business changes
  useEffect(() => {
    setActiveFYLabelState(localStorage.getItem(storageKey) || null);
  }, [storageKey]);

  const availableFYs = useMemo(() => {
    // Find earliest date across all transaction tables
    const tables = ['sales', 'purchases', 'expenses', 'payments', 'estimates',
      'creditNotes', 'debitNotes', 'deliveryNotes', 'journalEntries', 'opticals'];
    const dateKeys = ['date', 'orderDate'];
    let minDate = null;
    tables.forEach(table => {
      (data[table] || []).forEach(record => {
        const d = dateKeys.map(k => record[k]).find(Boolean);
        if (d && (!minDate || d < minDate)) minDate = d;
      });
    });

    // Always show at least 3 FYs (2 back from current + current)
    const currentStartYear = parseInt(currentFY.start.split('-')[0], 10);
    const floorStart = `${currentStartYear - 2}-${pad(fyStartMonth + 1)}-01`;
    const floorFY = getFYForDate(floorStart, fyStartMonth);

    // If data goes further back, start from there
    const dataFY = minDate ? getFYForDate(minDate, fyStartMonth) : null;
    let cur = (dataFY && dataFY.start < floorFY.start) ? dataFY : floorFY;

    const fys = [];
    let safety = 0;
    while (cur.start <= currentFY.start && safety < 30) {
      fys.unshift({ ...cur });
      cur = getFYForDate(advanceFYStart(cur.start, fyStartMonth), fyStartMonth);
      safety++;
    }
    return fys; // newest first (index 0)
  }, [data, fyStartMonth, currentFY]);

  const activeFY = useMemo(() => {
    if (activeFYLabel === 'all') return null;
    if (!activeFYLabel) return currentFY;
    return availableFYs.find(f => f.label === activeFYLabel) || currentFY;
  }, [activeFYLabel, availableFYs, currentFY]);

  const setActiveFY = (labelOrNull) => {
    setActiveFYLabelState(labelOrNull);
    if (labelOrNull) localStorage.setItem(storageKey, labelOrNull);
    else localStorage.removeItem(storageKey);
  };

  return (
    <FinancialYearContext.Provider value={{
      activeFY,
      activeFYLabel: activeFYLabel === 'all' ? 'all' : (activeFY?.label || currentFY.label),
      currentFY,
      availableFYs,
      setActiveFY,
      fyStartMonth,
    }}>
      {children}
    </FinancialYearContext.Provider>
  );
};

export const useFinancialYear = () => {
  const ctx = useContext(FinancialYearContext);
  if (!ctx) throw new Error('useFinancialYear must be used within FinancialYearProvider');
  return ctx;
};
