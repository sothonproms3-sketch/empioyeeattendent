/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Calculates the exact distance in meters between two geographical coordinates
 * using the Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const KHMER_DAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const KHMER_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ'
];

/**
 * Formats a javascript timestamp into an elegant localized Khmer Date representation
 */
export function formatKhmerDate(timestamp: number): string {
  const date = new Date(timestamp);
  const dayName = KHMER_DAYS[date.getDay()];
  const dateNum = date.getDate();
  const monthName = KHMER_MONTHS[date.getMonth()];
  const yearNum = date.getFullYear();

  // Convert numbers to Khmer numerals for high authenticity
  const conversionMap: { [key: string]: string } = {
    '0': '០',
    '1': '១',
    '2': '២',
    '3': '៣',
    '4': '៤',
    '5': '៥',
    '6': '៦',
    '7': '៧',
    '8': '៨',
    '9': '៩'
  };

  const convertToKhmerNumerals = (num: number | string): string => {
    return String(num)
      .split('')
      .map(char => conversionMap[char] || char)
      .join('');
  };

  return `ថ្ងៃ${dayName} ទី${convertToKhmerNumerals(dateNum)} ខែ${monthName} ឆ្នាំ${convertToKhmerNumerals(yearNum)}`;
}

/**
 * Formats time with Khmer numerals (e.g. ០៨:៣០:១៥)
 */
export function formatKhmerTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');

  const conversionMap: { [key: string]: string } = {
    '0': '០',
    '1': '១',
    '2': '២',
    '3': '៣',
    '4': '៤',
    '5': '៥',
    '6': '៦',
    '7': '៧',
    '8': '៨',
    '9': '៩'
  };

  const toKhmer = (str: string) =>
    str
      .split('')
      .map(char => conversionMap[char] || char)
      .join('');

  return `${toKhmer(h)}:${toKhmer(m)}:${toKhmer(s)}`;
}
