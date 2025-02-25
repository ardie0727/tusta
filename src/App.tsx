import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import ChartContainer from './components/ChartContainer';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Trading Chart Tool
          </h1>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-full ${
              isDarkMode ? 'bg-gray-800 text-yellow-400' : 'bg-gray-200 text-gray-900'
            }`}
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <ChartContainer isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  );
}

export default App;