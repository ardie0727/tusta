"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createChart, type IChartApi, LineStyle } from "lightweight-charts"
import axios from "axios"
import type { ChartContainerProps, CandlestickData, TrendlineCoordinates, AlertFormData } from "../types/chart"
import { Calendar, X } from "lucide-react"

const STORAGE_KEY = "trading-chart-trendlines"
const ALERTS_STORAGE_KEY = "trading-chart-alerts"
const TIME_OFFSET = 60
const API_URL = "http://127.0.0.1:5000"

const ChartContainer: React.FC<ChartContainerProps> = ({ isDarkMode }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<any>(null)
  const lineSeriesRef = useRef<any>(null)
  const trendlineSeriesRef = useRef<any[]>([])
  const [isDrawMode, setIsDrawMode] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<{ time: number; price: number } | null>(null)
  const [trendlines, setTrendlines] = useState<TrendlineCoordinates[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  })
  const [trendlineAlerts, setTrendlineAlerts] = useState<Record<string, AlertFormData>>(() => {
    const saved = localStorage.getItem(ALERTS_STORAGE_KEY)
    return saved ? JSON.parse(saved) : {}
  })
  const [error, setError] = useState<string | null>(null)
  const [apiResponse, setApiResponse] = useState<string | null>(null)
  const [hoverInfo, setHoverInfo] = useState<{
    visible: boolean
    x: number
    y: number
    trendline: TrendlineCoordinates | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    trendline: null,
  })
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    trendline: TrendlineCoordinates | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    trendline: null,
  })
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [alertFormData, setAlertFormData] = useState<AlertFormData>({
    trigger: "Only Once",
    expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T16:00",
    alertName: "",
    message: "",
    multiselect: [],
  })
  const [selectedTrendline, setSelectedTrendline] = useState<TrendlineCoordinates | null>(null)
  const [multiselect, setmultiselect] = useState([
    { id: "a", label: "a", selected: false },
    { id: "b", label: "b", selected: false },
    { id: "c", label: "c", selected: false },
    { id: "A", label: "A", selected: false },
    { id: "C", label: "C", selected: false },
    { id: "Rohit", label: "Rohit", selected: false },
  ])
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: isDarkMode ? "#1a1a1a" : "#ffffff" },
        textColor: isDarkMode ? "#d1d4dc" : "#000000",
      },
      grid: {
        vertLines: { color: isDarkMode ? "#2B2B43" : "#e1e1e1" },
        horzLines: { color: isDarkMode ? "#2B2B43" : "#e1e1e1" },
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
        secondsVisible: false,
      },
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    })

    const lineSeries = chart.addLineSeries({
      color: isDarkMode ? "#2962FF" : "#2962FF",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries
    lineSeriesRef.current = lineSeries

    return { chart, candlestickSeries }
  }, [isDarkMode, isDrawMode])

  const fetchAndDisplayData = useCallback(
    async (candlestickSeries: any, chart: IChartApi) => {
      try {
        const response = await axios.get("https://api.binance.com/api/v3/klines", {
          params: {
            symbol: "BTCUSDT",
            interval: "1h",
            limit: 100,
          },
        })

        if (response.data && Array.isArray(response.data)) {
          const data: CandlestickData[] = response.data.map((item: any) => ({
            time: Math.floor(item[0] / 1000),
            open: Number.parseFloat(item[1]),
            high: Number.parseFloat(item[2]),
            low: Number.parseFloat(item[3]),
            close: Number.parseFloat(item[4]),
          }))

          candlestickSeries.setData(data)

          chart.timeScale().fitContent()
          trendlineSeriesRef.current.forEach((series) => chart.removeSeries(series))
          trendlineSeriesRef.current = []

          trendlines.forEach((trendline) => {
            const savedLineSeries = chart.addLineSeries({
              color: isDarkMode ? "#2962FF" : "#2962FF",
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
            })

            const points = [
              { time: trendline.startTime, value: trendline.startPrice },
              { time: trendline.endTime + TIME_OFFSET, value: trendline.endPrice },
            ].sort((a, b) => a.time - b.time)

            savedLineSeries.setData(points)
            trendlineSeriesRef.current.push(savedLineSeries)
          })

          setError(null)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load chart data"
        setError(errorMessage)
      }
    },
    [isDarkMode, trendlines],
  )

  const isPointNearLine = (
    mouseX: number,
    mouseY: number,
    trendline: TrendlineCoordinates,
    chart: IChartApi,
    series: any,
  ): boolean => {
    if (!chart || !series) return false

    const timeScale = chart.timeScale()
    const startX = timeScale.timeToCoordinate(trendline.startTime)
    const endX = timeScale.timeToCoordinate(trendline.endTime)

    if (startX === null || endX === null) return false

    const startY = series.priceToCoordinate(trendline.startPrice)
    const endY = series.priceToCoordinate(trendline.endPrice)

    if (startY === null || endY === null) return false

    const A = mouseX - startX
    const B = mouseY - startY
    const C = endX - startX
    const D = endY - startY

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1

    if (lenSq !== 0) {
      param = dot / lenSq
    }

    let xx, yy

    if (param < 0) {
      xx = startX
      yy = startY
    } else if (param > 1) {
      xx = endX
      yy = endY
    } else {
      xx = startX + param * C
      yy = startY + param * D
    }

    const dx = mouseX - xx
    const dy = mouseY - yy
    const distance = Math.sqrt(dx * dx + dy * dy)

    return distance < 20
  }

  const getTrendlineId = (trendline: TrendlineCoordinates): string => {
    return `${trendline.startTime}-${trendline.startPrice}-${trendline.endTime}-${trendline.endPrice}`
  }

  const handleChartClick = (e: React.MouseEvent) => {
    if (e.button !== 2 || !chartRef.current || !chartContainerRef.current) return
    e.preventDefault()

    const rect = chartContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    for (let i = 0; i < trendlines.length; i++) {
      const trendline = trendlines[i]
      const series = trendlineSeriesRef.current[i]

      if (isPointNearLine(mouseX, mouseY, trendline, chartRef.current, series)) {
        setSelectedTrendline(trendline)

        const trendlineId = getTrendlineId(trendline)

        // Check if we have existing alert data for this trendline
        const existingAlertData = trendlineAlerts[trendlineId]

        if (existingAlertData) {
          // Use existing alert data
          setAlertFormData(existingAlertData)

          // Update the notification channels based on existing data
          if (existingAlertData.multiselect) {
            setmultiselect((channels) =>
              channels.map((channel) => ({
                ...channel,
                selected: existingAlertData.multiselect.includes(channel.id),
              })),
            )
          }
        } else {
          // Create default alert data
          setAlertFormData({
            trigger: "Only Once",
            expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T16:00",
            alertName: "",
            message: `BTCUSDT Crossing Trend Line (${trendline.startPrice.toFixed(2)} - ${trendline.endPrice.toFixed(2)})`,
            multiselect: [],
          })

          // Reset notification channels
          setmultiselect((channels) =>
            channels.map((channel) => ({
              ...channel,
              selected: false,
            })),
          )
        }

        setShowAlertForm(true)
        return
      }
    }

    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!chartRef.current || !chartContainerRef.current) return

    const rect = chartContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (isDrawMode && drawing && startPoint) {
      handleDrawingMouseMove(e)
      return
    }

    let foundTrendline = false
    for (let i = 0; i < trendlines.length; i++) {
      const trendline = trendlines[i]
      const series = trendlineSeriesRef.current[i]

      if (isPointNearLine(mouseX, mouseY, trendline, chartRef.current, series)) {
        setHoverInfo({
          visible: true,
          x: e.clientX,
          y: e.clientY - 40,
          trendline,
        })
        foundTrendline = true
        break
      }
    }

    if (!foundTrendline) {
      setHoverInfo((prev) => ({ ...prev, visible: false }))
    }
  }

  const handleDrawingMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !startPoint || !chartRef.current || !candlestickSeriesRef.current || !lineSeriesRef.current) return

    const rect = chartContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const currentTime = chartRef.current.timeScale().coordinateToTime(x) as number
    const currentPrice = candlestickSeriesRef.current.coordinateToPrice(y)

    if (currentTime && currentPrice) {
      const points = [
        { time: startPoint.time, value: startPoint.price },
        {
          time: currentTime === startPoint.time ? currentTime + TIME_OFFSET : currentTime,
          value: currentPrice,
        },
      ].sort((a, b) => a.time - b.time)

      lineSeriesRef.current.setData(points)
    }
  }

  useEffect(() => {
    const { chart, candlestickSeries } = initializeChart() || {}
    if (chart && candlestickSeries) {
      fetchAndDisplayData(candlestickSeries, chart)

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          })
        }
      }

      const handleClickOutside = (e: MouseEvent) => {
        if (e.button !== 2) {
          setContextMenu((prev) => ({ ...prev, visible: false }))
        }
      }

      window.addEventListener("resize", handleResize)
      window.addEventListener("click", handleClickOutside)

      return () => {
        window.removeEventListener("resize", handleResize)
        window.removeEventListener("click", handleClickOutside)
        if (chartRef.current) {
          chartRef.current.remove()
          chartRef.current = null
          candlestickSeriesRef.current = null
          lineSeriesRef.current = null
          trendlineSeriesRef.current = []
        }
      }
    }
  }, [initializeChart, fetchAndDisplayData])

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        handleScroll: !isDrawMode,
        handleScale: !isDrawMode,
      })
    }
  }, [isDrawMode])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trendlines))
  }, [trendlines])

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(trendlineAlerts))
  }, [trendlineAlerts])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDrawMode || !chartRef.current || !candlestickSeriesRef.current) return

    const rect = chartContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const time = chartRef.current.timeScale().coordinateToTime(x) as number
    const price = candlestickSeriesRef.current.coordinateToPrice(y)

    if (time && price) {
      setDrawing(true)
      setStartPoint({ time, price })
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !startPoint || !chartRef.current || !candlestickSeriesRef.current) return

    const rect = chartContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const endTime = chartRef.current.timeScale().coordinateToTime(x) as number
    const endPrice = candlestickSeriesRef.current.coordinateToPrice(y)

    if (endTime && endPrice) {
      const newTrendline: TrendlineCoordinates = {
        startTime: startPoint.time,
        startPrice: startPoint.price,
        endTime: endTime === startPoint.time ? endTime + TIME_OFFSET : endTime,
        endPrice: endPrice,
      }

      setTrendlines([...trendlines, newTrendline])

      // Clear the temporary line
      if (lineSeriesRef.current) {
        lineSeriesRef.current.setData([])
      }
    }

    setDrawing(false)
    setStartPoint(null)
  }

  const clearTrendlines = () => {
    setTrendlines([])
    setTrendlineAlerts({})
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ALERTS_STORAGE_KEY)

    // Safely remove the old chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      candlestickSeriesRef.current = null
      lineSeriesRef.current = null
      trendlineSeriesRef.current = []
    }

    // Initialize a new chart
    const { chart, candlestickSeries } = initializeChart() || {}
    if (chart && candlestickSeries) {
      fetchAndDisplayData(candlestickSeries, chart)
    }
  }

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const handleAlertFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setAlertFormData({
      ...alertFormData,
      [name]: value,
    })
  }

  const togglemultiselect = (channelId: string) => {
    setmultiselect((channels) =>
      channels.map((channel) => (channel.id === channelId ? { ...channel, selected: !channel.selected } : channel)),
    )

    // Update the form data with selected channels
    const selectedChannels = multiselect
      .filter((channel) => (channel.id === channelId ? !channel.selected : channel.selected))
      .map((channel) => channel.id)

    setAlertFormData((prev) => ({
      ...prev,
      multiselect: selectedChannels,
    }))
  }

  const handleAlertFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedTrendline) return

    try {
      const trendlineId = getTrendlineId(selectedTrendline)

   
      const selectedChannels = multiselect.filter((channel) => channel.selected).map((channel) => channel.id)

      const updatedAlertData = {
        ...alertFormData,
        multiselect: selectedChannels,
      }

      setTrendlineAlerts((prev) => ({
        ...prev,
        [trendlineId]: updatedAlertData,
      }))

      const response = await axios.post(API_URL, {
        start: {
          time: selectedTrendline.startTime,
          price: selectedTrendline.startPrice,
        },
        end: {
          time: selectedTrendline.endTime,
          price: selectedTrendline.endPrice,
        },
        alert: updatedAlertData,
      })

      setApiResponse(response.data.message)
      setTimeout(() => {
        setApiResponse(null)
      }, 3000)

      setShowAlertForm(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send trendline data to API"
      setError(errorMessage)
      setTimeout(() => {
        setError(null)
      }, 3000)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        const target = event.target as Node
        const dropdown = document.getElementById("notification-dropdown")
        if (dropdown && !dropdown.contains(target)) {
          setDropdownOpen(false)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [dropdownOpen])

  return (
    <div className="relative">
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setIsDrawMode(!isDrawMode)}
          className={`px-4 py-2 rounded ${isDrawMode ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          {isDrawMode ? "Drawing Mode: On" : "Drawing Mode: Off"}
        </button>
        <button onClick={clearTrendlines} className="px-4 py-2 rounded bg-red-500 text-white">
          Clear All Trendlines
        </button>
      </div>
      {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}
      {apiResponse && <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-md">{apiResponse}</div>}
      <div
        ref={chartContainerRef}
        className="relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleChartClick}
        onMouseLeave={() => {
          setDrawing(false)
          setStartPoint(null)
          setHoverInfo((prev) => ({ ...prev, visible: false }))
          if (lineSeriesRef.current) {
            lineSeriesRef.current.setData([])
          }
        }}
      />

      {}
      {hoverInfo.visible && hoverInfo.trendline && (
        <div
          className={`absolute p-3 rounded-md z-50 ${
            isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-800 shadow-md"
          }`}
          style={{
            left: hoverInfo.x,
            top: hoverInfo.y,
            transform: "translate(-50%, -100%)",
            pointerEvents: "none",
            minWidth: "220px",
          }}
        >
          <div className="text-sm">
            <div className={`font-semibold mb-2 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
              Trendline Coordinates
            </div>
            <div className="mb-2">
              <span className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Start:</span>
              <div className="ml-4">
                <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                  Time: {formatDateTime(hoverInfo.trendline.startTime)}
                </div>
                <div className={`${isDarkMode ? "text-green-400" : "text-green-600"} font-medium`}>
                  Price: ${hoverInfo.trendline.startPrice.toFixed(2)}
                </div>
              </div>
            </div>
            <div>
              <span className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>End:</span>
              <div className="ml-4">
                <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                  Time: {formatDateTime(hoverInfo.trendline.endTime)}
                </div>
                <div className={`${isDarkMode ? "text-green-400" : "text-green-600"} font-medium`}>
                  Price: ${hoverInfo.trendline.endPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {contextMenu.visible && contextMenu.trendline && (
        <div
          className={`absolute shadow-lg rounded-lg p-4 z-50 ${
            isDarkMode
              ? "bg-gray-800 text-gray-200 border border-gray-700"
              : "bg-white text-gray-800 border border-gray-200"
          }`}
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <div className="text-sm">
            <div className={`font-semibold mb-2 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
              Trendline Coordinates
            </div>
            <div className="mb-2">
              <span className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Start:</span>
              <div className="ml-2">
                <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                  Time: {formatDateTime(contextMenu.trendline.startTime)}
                </div>
                <div className={`${isDarkMode ? "text-green-400" : "text-green-600"}`}>
                  Price: ${contextMenu.trendline.startPrice.toFixed(2)}
                </div>
              </div>
            </div>
            <div>
              <span className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>End:</span>
              <div className="ml-2">
                <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                  Time: {formatDateTime(contextMenu.trendline.endTime)}
                </div>
                <div className={`${isDarkMode ? "text-green-400" : "text-green-600"}`}>
                  Price: ${contextMenu.trendline.endPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showAlertForm && selectedTrendline && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className={`relative w-full max-w-lg p-6 rounded-lg ${
              isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-800"
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit Alert on BTCUSDT</h2>
              <button
                onClick={() => setShowAlertForm(false)}
                className={`p-1 rounded-full ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <div className="flex border-b border-gray-300 mb-4">
                <button
                  className={`py-2 px-4 font-medium ${
                    isDarkMode ? "text-white border-b-2 border-blue-500" : "text-gray-800 border-b-2 border-blue-600"
                  }`}
                >
                  Settings
                </button>
              </div>

              <div className="mb-4">
                <div
                  className={`p-3 border rounded-md ${
                    isDarkMode ? "border-gray-700 bg-gray-700" : "border-gray-300 bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>Trend Line</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAlertFormSubmit}>
              <div className="mb-6">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className={`flex justify-between items-center w-full p-3 rounded-md border ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600 text-white"
                          : "bg-gray-100 border-gray-300 text-gray-800"
                      }`}
                    >
                      <span>
                        {multiselect.filter((c) => c.selected).length > 0
                          ? `${multiselect.filter((c) => c.selected).length} selected`
                          : "Select options"}
                      </span>

                    </button>

                    {dropdownOpen && (
                      <div
                        className={`absolute z-50 w-full mt-1 rounded-md shadow-lg ${
                          isDarkMode ? "bg-gray-700 border border-gray-600" : "bg-white border border-gray-200"
                        }`}
                      >
                        <div className="py-1 max-h-60 overflow-auto">
                          {multiselect.map((channel) => (
                            <div
                              key={channel.id}
                              onClick={() => togglemultiselect(channel.id)}
                              className={`px-4 py-2 cursor-pointer flex items-center gap-2 ${
                                isDarkMode
                                  ? channel.selected
                                    ? "bg-gray-600"
                                    : "hover:bg-gray-600"
                                  : channel.selected
                                    ? "bg-gray-100"
                                    : "hover:bg-gray-50"
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                  channel.selected
                                    ? isDarkMode
                                      ? "border-white bg-blue-500"
                                      : "border-blue-500 bg-blue-500"
                                    : isDarkMode
                                      ? "border-gray-400"
                                      : "border-gray-400"
                                }`}
                              >
                              </div>
                              {channel.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {multiselect.filter((c) => c.selected).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {multiselect
                        .filter((c) => c.selected)
                        .map((channel) => (
                          <div
                            key={channel.id}
                            className={`px-2 py-1 text-sm rounded-md flex items-center gap-1 ${
                              isDarkMode ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {channel.label}
                            <button
                              type="button"
                              onClick={() => togglemultiselect(channel.id)}
                              className={`ml-1 rounded-full p-0.5 ${
                                isDarkMode ? "hover:bg-gray-500" : "hover:bg-gray-200"
                              }`}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block mb-2 font-medium">Expiration</label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      name="expiration"
                      value={alertFormData.expiration}
                      onChange={handleAlertFormChange}
                      className={`p-3 pl-10 w-full rounded-md border ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600 text-white"
                          : "bg-gray-100 border-gray-300 text-gray-800"
                      }`}
                    />
                    <Calendar
                      className={`absolute left-3 top-3 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      size={18}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block mb-2 font-medium">Alert name</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="alertName"
                      placeholder="Add a custom name"
                      value={alertFormData.alertName}
                      onChange={handleAlertFormChange}
                      className={`p-3 pl-10 w-full rounded-md border ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600 text-white"
                          : "bg-gray-100 border-gray-300 text-gray-800"
                      }`}
                    />
                    <span className="absolute left-3 top-3 text-xl">+</span>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block mb-2 font-medium flex items-center">
                    Message
                    <span className="ml-2 inline-block w-5 h-5 bg-amber-500 text-white rounded-full text-xs flex items-center justify-center">
                      !
                    </span>
                  </label>
                  <textarea
                    name="message"
                    value={alertFormData.message}
                    onChange={handleAlertFormChange}
                    rows={3}
                    className={`p-3 w-full rounded-md border ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-gray-100 border-gray-300 text-gray-800"
                    }`}
                  />
                  <div className={`mt-2 p-3 rounded-md ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}`}>
                    <div className="flex items-center">
                      <span>Add placeholder</span>
                      <span className="ml-2 inline-block w-5 h-5 bg-gray-400 text-white rounded-full text-xs flex items-center justify-center">
                        ?
                      </span>
                    </div>
                  </div>
                </div>



                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setShowAlertForm(false)}
                    className={`p-2 rounded-md border ${
                      isDarkMode ? "border-gray-600 text-white" : "border-gray-300 text-gray-800"
                    }`}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="p-2 rounded-md bg-black text-white">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChartContainer

