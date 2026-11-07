export interface Product {
  id: number;
  code: string;
  barcode: string;
  name: string;
  category: string;
  description?: string;
  price: number;
  cost_price: number;
  stock_qty: number;
  min_stock: number;
  image_url?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface MaterialItem {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  stock_qty: number;
  min_stock: number;
  cost_unit: number;
}

export interface ProductionOrder {
  id: number;
  order_number: string;
  product_id: number;
  product?: Product;
  target_quantity: number;
  produced_quantity: number;
  status: string;
  total_cost: number;
  notes?: string;
  completed_at?: string;
  created_at: string;
}

export interface SaleReceipt {
  id: number;
  invoice_number: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  customer_name?: string;
  customer_cpf?: string;
  nfce_key: string;
  nfce_protocol: string;
  nfce_series: string;
  nfce_number: number;
  nfce_status: string;
  nfce_qrcode_url: string;
  created_at: string;
  items: {
    id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: Product;
  }[];
}

export interface DREData {
  period: string;
  gross_revenue: number;
  pos_sales: number;
  other_revenue: number;
  deductions_taxes: number;
  net_revenue: number;
  cpv_materials: number;
  gross_profit: number;
  gross_margin_percent: number;
  operational_expenses: number;
  ebitda: number;
  depreciation: number;
  net_profit: number;
}

export interface CashFlowData {
  current_balance: number;
  projected_balance: number;
  total_inflow_paid: number;
  total_outflow_paid: number;
  pending_receivables: number;
  pending_payables: number;
  transactions: {
    id: number;
    description: string;
    type: 'revenue' | 'expense';
    category: string;
    amount: number;
    due_date: string;
    status: 'paid' | 'pending' | 'cancelled';
    payment_method?: string;
  }[];
}

export interface MLForecastMonth {
  month_number: number;
  month_label: string;
  projected_units: number;
  estimated_revenue: number;
  avg_wind_knots: number;
  vacation_season: boolean;
  confidence_interval: [number, number];
}
