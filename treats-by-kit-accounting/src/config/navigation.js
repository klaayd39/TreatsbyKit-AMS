import {
  ArrowLeftRight,
  Banknote,
  Bell,
  BookBookmark,
  BookOpen,
  Boxes,
  Cake,
  Calculator,
  CalendarDays,
  ChartColumn,
  ChartLine,
  ChartPie,
  ClipboardList,
  Factory,
  FileText,
  HandCoins,
  History,
  Layers,
  LayoutDashboard,
  Library,
  ListTree,
  Package,
  PackageCheck,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wheat,
} from 'lucide-react'

export const navigation = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { id: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { id: 'pos', label: 'Point of Sale (POS)', path: '/sales/pos', icon: ShoppingCart },
      { id: 'orders', label: 'Orders', path: '/sales/orders', icon: ClipboardList },
      { id: 'sales-history', label: 'Sales History', path: '/sales/history', icon: History },
      { id: 'sales-reports', label: 'Sales Reports', path: '/sales/reports', icon: ChartColumn },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      { id: 'raw-materials', label: 'Raw Materials', path: '/inventory/raw-materials', icon: Wheat },
      { id: 'finished-goods', label: 'Finished Goods', path: '/inventory/finished-goods', icon: Cake },
      {
        id: 'packaging-materials',
        label: 'Packaging Materials',
        path: '/inventory/packaging',
        icon: Package,
      },
      {
        id: 'stock-movements',
        label: 'Stock Movements',
        path: '/inventory/movements',
        icon: ArrowLeftRight,
      },
      {
        id: 'inventory-reports',
        label: 'Inventory Reports',
        path: '/inventory/reports',
        icon: Boxes,
      },
    ],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    items: [
      { id: 'suppliers', label: 'Suppliers', path: '/purchasing/suppliers', icon: Truck },
      {
        id: 'purchase-orders',
        label: 'Purchase Orders',
        path: '/purchasing/orders',
        icon: FileText,
      },
      {
        id: 'purchase-invoices',
        label: 'Purchase Invoices',
        path: '/purchasing/invoices',
        icon: Receipt,
      },
      {
        id: 'receiving-records',
        label: 'Receiving Records',
        path: '/purchasing/receiving',
        icon: PackageCheck,
      },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    items: [
      {
        id: 'recipes',
        label: 'Product Recipes (BOM)',
        path: '/production/recipes',
        icon: BookOpen,
      },
      {
        id: 'production-planning',
        label: 'Production Planning',
        path: '/production/planning',
        icon: CalendarDays,
      },
      {
        id: 'production-batches',
        label: 'Production Batches',
        path: '/production/batches',
        icon: Layers,
      },
      {
        id: 'production-costing',
        label: 'Production Costing',
        path: '/production/costing',
        icon: Calculator,
      },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    items: [
      {
        id: 'chart-of-accounts',
        label: 'Chart of Accounts',
        path: '/accounting/chart-of-accounts',
        icon: ListTree,
      },
      {
        id: 'journal-entries',
        label: 'Journal Entries',
        path: '/accounting/journal-entries',
        icon: BookBookmark,
      },
      {
        id: 'general-ledger',
        label: 'General Ledger',
        path: '/accounting/general-ledger',
        icon: Library,
      },
      {
        id: 'accounts-payable',
        label: 'Accounts Payable',
        path: '/accounting/accounts-payable',
        icon: Wallet,
      },
      {
        id: 'accounts-receivable',
        label: 'Accounts Receivable',
        path: '/accounting/accounts-receivable',
        icon: HandCoins,
      },
      { id: 'expenses', label: 'Expenses', path: '/accounting/expenses', icon: Banknote },
      {
        id: 'financial-statements',
        label: 'Financial Statements',
        path: '/accounting/financial-statements',
        icon: ChartPie,
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { id: 'report-sales', label: 'Sales Reports', path: '/reports/sales', icon: TrendingUp },
      {
        id: 'report-inventory',
        label: 'Inventory Reports',
        path: '/reports/inventory',
        icon: Warehouse,
      },
      {
        id: 'report-production',
        label: 'Production Reports',
        path: '/reports/production',
        icon: Factory,
      },
      {
        id: 'report-financial',
        label: 'Financial Reports',
        path: '/reports/financial',
        icon: ChartLine,
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'employees',
        label: 'Employees & User Roles',
        path: '/admin/employees',
        icon: Users,
      },
      {
        id: 'business-settings',
        label: 'Business Settings',
        path: '/admin/settings',
        icon: Settings,
      },
      { id: 'audit-logs', label: 'Audit Logs', path: '/admin/audit-logs', icon: ScrollText },
    ],
  },
]

export function flattenNavigation(groups = navigation) {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupLabel: group.label,
    })),
  )
}

export function findNavigationItem(pathname) {
  for (const group of navigation) {
    const item = group.items.find((entry) => entry.path === pathname)
    if (item) return { group, item }
  }
  return null
}
