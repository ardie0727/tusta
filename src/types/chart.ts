export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrendlineCoordinates {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
}

export interface ChartContainerProps {
  isDarkMode: boolean;
}

export interface AlertFormData {
  trigger: string;
  expiration: string;
  alertName: string;
  message: string;
}