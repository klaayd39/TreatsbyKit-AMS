import ItemCatalog from '../../components/inventory/ItemCatalog'

const FINISHED_CATEGORIES = [{ value: 'finished_good', label: 'Finished good' }]

export default function FinishedGoodsPage() {
  return (
    <ItemCatalog
      category="finished_good"
      categoryOptions={FINISHED_CATEGORIES}
      title="Finished Goods"
      description="Products from production. On hand comes from stock movements, average cost from production output, and selling price is what the POS charges."
      showSellingPrice
      emptyTitle="No finished goods yet"
      emptyDescription="Add a product before you can build a recipe for it."
    />
  )
}
