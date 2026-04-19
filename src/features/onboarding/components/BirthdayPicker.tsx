import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BirthdayPickerProps {
  value: { month: string; day: string; year: string } | null;
  onChange: (value: { month: string; day: string; year: string } | null) => void;
  error?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function BirthdayPicker({ value, onChange, error }: BirthdayPickerProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const handleMonthChange = (month: string) => {
    onChange({ month, day: value?.day || '', year: value?.year || '' });
  };
  const handleDayChange = (day: string) => {
    onChange({ month: value?.month || '', day, year: value?.year || '' });
  };
  const handleYearChange = (year: string) => {
    onChange({ month: value?.month || '', day: value?.day || '', year });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value?.month || ''} onValueChange={handleMonthChange}>
          <SelectTrigger className={`w-[120px] ${error && !value?.month ? 'border-destructive' : ''}`}>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((month, idx) => (
              <SelectItem key={month} value={(idx + 1).toString().padStart(2, '0')}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value?.day || ''} onValueChange={handleDayChange}>
          <SelectTrigger className={`w-[90px] ${error && !value?.day ? 'border-destructive' : ''}`}>
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {days.map(day => (
              <SelectItem key={day} value={day.toString().padStart(2, '0')}>
                {day}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value?.year || ''} onValueChange={handleYearChange}>
          <SelectTrigger className={`flex-1 ${error && !value?.year ? 'border-destructive' : ''}`}>
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map(year => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
