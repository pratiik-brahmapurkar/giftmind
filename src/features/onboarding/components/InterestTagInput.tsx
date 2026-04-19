import React, { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface InterestTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  maxTags?: number;
}

export function InterestTagInput({ value, onChange, suggestions, maxTags = 5 }: InterestTagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim().replace(/^,|,$/g, '');
      if (newTag && value.length < maxTags && !value.includes(newTag)) {
        onChange([...value, newTag]);
        setInputValue('');
      } else if (value.includes(newTag)) {
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };
  
  const addSuggestion = (tag: string) => {
    if (value.length < maxTags && !value.includes(tag)) {
      onChange([...value, tag]);
    }
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map(tag => (
            <span key={tag} className="flex items-center px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="ml-2 focus:outline-none hover:text-primary/70">
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={value.length >= maxTags}
        placeholder={value.length >= maxTags ? "Maximum tags reached" : "Type an interest and press Enter"}
        className="w-full"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="text-sm text-muted-foreground mr-1 self-center">Suggestions:</span>
        {suggestions.filter(s => !value.includes(s)).map(suggestion => (
          <button
            key={suggestion}
            type="button"
            onClick={() => addSuggestion(suggestion)}
            className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
