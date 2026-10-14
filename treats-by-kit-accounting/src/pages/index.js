import DashboardPage from './main/DashboardPage'
import NotificationsPage from './main/NotificationsPage'
import PosPage from './sales/PosPage'
import OrdersPage from './sales/OrdersPage'
import SalesHistoryPage from './sales/SalesHistoryPage'
import SalesReportsPage from './sales/SalesReportsPage'
import RawMaterialsPage from './inventory/RawMaterialsPage'
import FinishedGoodsPage from './inventory/FinishedGoodsPage'
import PackagingMaterialsPage from './inventory/PackagingMaterialsPage'
import StockMovementsPage from './inventory/StockMovementsPage'
import InventoryReportsPage from './inventory/InventoryReportsPage'
import SuppliersPage from './purchasing/SuppliersPage'
import PurchaseOrdersPage from './purchasing/PurchaseOrdersPage'
import PurchaseInvoicesPage from './purchasing/PurchaseInvoicesPage'
import ReceivingRecordsPage from './purchasing/ReceivingRecordsPage'
import RecipesPage from './production/RecipesPage'
import ProductionPlanningPage from './production/ProductionPlanningPage'
import ProductionBatchesPage from './production/ProductionBatchesPage'
import ProductionCostingPage from './production/ProductionCostingPage'
import ChartOfAccountsPage from './accounting/ChartOfAccountsPage'
import JournalEntriesPage from './accounting/JournalEntriesPage'
import GeneralLedgerPage from './accounting/GeneralLedgerPage'
import AccountsPayablePage from './accounting/AccountsPayablePage'
import AccountsReceivablePage from './accounting/AccountsReceivablePage'
import ExpensesPage from './accounting/ExpensesPage'
import FinancialStatementsPage from './accounting/FinancialStatementsPage'
import ReportSalesPage from './reports/ReportSalesPage'
import ReportInventoryPage from './reports/ReportInventoryPage'
import ReportProductionPage from './reports/ReportProductionPage'
import ReportFinancialPage from './reports/ReportFinancialPage'
import EmployeesPage from './administration/EmployeesPage'
import BusinessSettingsPage from './administration/BusinessSettingsPage'
import AuditLogsPage from './administration/AuditLogsPage'

export const pageComponents = {
  'dashboard': DashboardPage,
  'notifications': NotificationsPage,
  'pos': PosPage,
  'orders': OrdersPage,
  'sales-history': SalesHistoryPage,
  'sales-reports': SalesReportsPage,
  'raw-materials': RawMaterialsPage,
  'finished-goods': FinishedGoodsPage,
  'packaging-materials': PackagingMaterialsPage,
  'stock-movements': StockMovementsPage,
  'inventory-reports': InventoryReportsPage,
  'suppliers': SuppliersPage,
  'purchase-orders': PurchaseOrdersPage,
  'purchase-invoices': PurchaseInvoicesPage,
  'receiving-records': ReceivingRecordsPage,
  'recipes': RecipesPage,
  'production-planning': ProductionPlanningPage,
  'production-batches': ProductionBatchesPage,
  'production-costing': ProductionCostingPage,
  'chart-of-accounts': ChartOfAccountsPage,
  'journal-entries': JournalEntriesPage,
  'general-ledger': GeneralLedgerPage,
  'accounts-payable': AccountsPayablePage,
  'accounts-receivable': AccountsReceivablePage,
  'expenses': ExpensesPage,
  'financial-statements': FinancialStatementsPage,
  'report-sales': ReportSalesPage,
  'report-inventory': ReportInventoryPage,
  'report-production': ReportProductionPage,
  'report-financial': ReportFinancialPage,
  'employees': EmployeesPage,
  'business-settings': BusinessSettingsPage,
  'audit-logs': AuditLogsPage,
}
