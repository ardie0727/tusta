import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, LineStyle } from 'lightweight-charts';
import axios from 'axios';
import { ChartContainerProps, CandlestickData, TrendlineCoordinates } from '../types/chart';

const STORAGE_KEY = 'trading-chart-trendlines';
const TIME_OFFSET = 60; // 1 minute offset in seconds

const ChartContainer: React.FC<ChartContainerProps> = ({ isDarkMode }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);
  const trendlineSeriesRef = useRef<any[]>([]);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ time: number; price: number } | null>(null);
  const [trendlines, setTrendlines] = useState<TrendlineCoordinates[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    trendline: TrendlineCoordinates | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    trendline: null,
  });

  const initializeChart = () => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: isDarkMode ? '#1a1a1a' : '#ffffff' },
        textColor: isDarkMode ? '#d1d4dc' : '#000000',
      },
      grid: {
        vertLines: { color: isDarkMode ? '#2B2B43' : '#e1e1e1' },
        horzLines: { color: isDarkMode ? '#2B2B43' : '#e1e1e1' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      crosshair: {
        mode: 0,
      },
      handleScroll: !isDrawMode,
      handleScale: !isDrawMode,
      timeScale: {
        rightOffset: 5,
        barSpacing: 15,
        fixLeftEdge: true,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderVisible: false,
        visible: true,
        timeVisible: true,
        secondsVisible: false
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const lineSeries = chart.addLineSeries({
      color: isDarkMode ? '#2962FF' : '#2962FF',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    lineSeriesRef.current = lineSeries;

    return { chart, candlestickSeries };
  };

  const fetchAndDisplayData = async (candlestickSeries: any, chart: IChartApi) => {
    try {
      const response = await axios.get(
        'https://api.binance.com/api/v3/klines',
        {
          params: {
            symbol: 'BTCUSDT',
            interval: '1h',
            limit: 100
          }
        }
      );
      
      if (response.data && Array.isArray(response.data)) {
        const data: CandlestickData[] = response.data.map((item: any) => ({
          time: Math.floor(item[0] / 1000),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        }));

        candlestickSeries.setData(data);

        // Fit content to view
        chart.timeScale().fitContent();

        // Clear previous trendline series
        trendlineSeriesRef.current.forEach(series => chart.removeSeries(series));
        trendlineSeriesRef.current = [];

        // Draw saved trendlines
        trendlines.forEach((trendline) => {
          const savedLineSeries = chart.addLineSeries({
            color: isDarkMode ? '#2962FF' : '#2962FF',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
          });

          const points = [
            { time: trendline.startTime, value: trendline.startPrice },
            { time: trendline.endTime + TIME_OFFSET, value: trendline.endPrice },
          ].sort((a, b) => a.time - b.time);
          
          savedLineSeries.setData(points);
          trendlineSeriesRef.current.push(savedLineSeries);
        });

        setError(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chart data';
      setError(errorMessage);
    }
  };

  const isPointNearLine = (
    mouseX: number,
    mouseY: number,
    trendline: TrendlineCoordinates,
    chart: IChartApi,
    series: any
  ): boolean => {
    if (!chart || !series) return false;

    const timeScale = chart.timeScale();
    const startX = timeScale.timeToCoordinate(trendline.startTime);
    const endX = timeScale.timeToCoordinate(trendline.endTime);
    
    if (startX === null || endX === null) return false;

    const startY = series.priceToCoordinate(trendline.startPrice);
    const endY = series.priceToCoordinate(trendline.endPrice);
    
    if (startY === null || endY === null) return false;

    // Calculate distance from point to line segment
    const A = mouseX - startX;
    const B = mouseY - startY;
    const C = endX - startX;
    const D = endY - startY;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = startX;
      yy = startY;
    } else if (param > 1) {
      xx = endX;
      yy = endY;
    } else {
      xx = startX + param * C;
      yy = startY + param * D;
    }

    const dx = mouseX - xx;
    const dy = mouseY - yy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < 20; // 20px threshold
  };

  const handleChartClick = (e: React.MouseEvent) => {
    if (e.button !== 2 || !chartRef.current || !chartContainerRef.current) return;
    e.preventDefault();

    const rect = chartContainerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Find the trendline that was clicked
    for (let i = 0; i < trendlines.length; i++) {
      const trendline = trendlines[i];
      const series = trendlineSeriesRef.current[i];

      if (isPointNearLine(mouseX, mouseY, trendline, chartRef.current, series)) {
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          trendline,
        });
        return;
      }
    }

    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    const { chart, candlestickSeries } = initializeChart() || {};
    if (chart && candlestickSeries) {
      fetchAndDisplayData(candlestickSeries, chart);

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      const handleClickOutside = (e: MouseEvent) => {
        if (e.button !== 2) {
          setContextMenu(prev => ({ ...prev, visible: false }));
        }
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('click', handleClickOutside);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('click', handleClickOutside);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          candlestickSeriesRef.current = null;
          lineSeriesRef.current = null;
          trendlineSeriesRef.current = [];
        }
      };
    }
  }, [isDarkMode, trendlines]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        handleScroll: !isDrawMode,
        handleScale: !isDrawMode,
      });
    }
  }, [isDrawMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trendlines));
  }, [trendlines]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDrawMode || !chartRef.current || !candlestickSeriesRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chartRef.current.timeScale().coordinateToTime(x) as number;
    const price = candlestickSeriesRef.current.coordinateToPrice(y);

    if (time && price) {
      setDrawing(true);
      setStartPoint({ time, price });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !startPoint || !chartRef.current || !candlestickSeriesRef.current || !lineSeriesRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentTime = chartRef.current.timeScale().coordinateToTime(x) as number;
    const currentPrice = candlestickSeriesRef.current.coordinateToPrice(y);

    if (currentTime && currentPrice) {
      const points = [
        { time: startPoint.time, value: startPoint.price },
        { 
          time: currentTime === startPoint.time ? currentTime + TIME_OFFSET : currentTime, 
          value: currentPrice 
        },
      ].sort((a, b) => a.time - b.time);
      
      lineSeriesRef.current.setData(points);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !startPoint || !chartRef.current || !candlestickSeriesRef.current) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const endTime = chartRef.current.timeScale().coordinateToTime(x) as number;
    const endPrice = candlestickSeriesRef.current.coordinateToPrice(y);

    if (endTime && endPrice) {
      const newTrendline: TrendlineCoordinates = {
        startTime: startPoint.time,
        startPrice: startPoint.price,
        endTime: endTime === startPoint.time ? endTime + TIME_OFFSET : endTime,
        endPrice: endPrice,
      };

      setTrendlines([...trendlines, newTrendline]);

      // Clear the temporary line
      if (lineSeriesRef.current) {
        lineSeriesRef.current.setData([]);
      }
    }

    setDrawing(false);
    setStartPoint(null);
  };

  const clearTrendlines = () => {
    setTrendlines([]);
    localStorage.removeItem(STORAGE_KEY);
    
    // Safely remove the old chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      lineSeriesRef.current = null;
      trendlineSeriesRef.current = [];
    }

    // Initialize a new chart
    const { chart, candlestickSeries } = initializeChart() || {};
    if (chart && candlestickSeries) {
      fetchAndDisplayData(candlestickSeries, chart);
    }
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="relative">
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setIsDrawMode(!isDrawMode)}
          className={`px-4 py-2 rounded ${
            isDrawMode
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {isDrawMode ? 'Drawing Mode: On' : 'Drawing Mode: Off'}
        </button>
        <button
          onClick={clearTrendlines}
          className="px-4 py-2 rounded bg-red-500 text-white"
        >
          Clear All Trendlines
        </button>
      </div>
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      <div
        ref={chartContainerRef}
        className="relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleChartClick}
        onMouseLeave={() => {
          setDrawing(false);
          setStartPoint(null);
          if (lineSeriesRef.current) {
            lineSeriesRef.current.setData([]);
          }
        }}
      />
      {contextMenu.visible && contextMenu.trendline && (
        <div
          className={`absolute shadow-lg rounded-lg p-4 z-50 ${
            isDarkMode 
              ? 'bg-gray-800 text-gray-200 border border-gray-700' 
              : 'bg-white text-gray-800 border border-gray-200'
          }`}
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <div className="text-sm">
            <div className={`font-semibold mb-2 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              Trendline Coordinates
            </div>
            <div className="mb-2">
              <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Start:</span>
              <div className="ml-2">
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                  Time: {formatDateTime(contextMenu.trendline.startTime)}
                </div>
                <div className={`${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  Price: ${contextMenu.trendline.startPrice.toFixed(2)}
                </div>
              </div>
            </div>
            <div>
              <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>End:</span>
              <div className="ml-2">
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                  Time: {formatDateTime(contextMenu.trendline.endTime)}
                </div>
                <div className={`${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  Price: ${contextMenu.trendline.endPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartContainer;