import ItemCatalog from '../../components/inventory/ItemCatalog'

export default function PackagingMaterialsPage() {
  return (
    <ItemCatalog
      category="packaging"
      title="Packaging Materials"
      description="Boxes, packs, and other packaging. On hand is computed from stock movements."
      emptyTitle="No packaging materials yet"
      emptyDescription="Add a packaging item to start tracking stock."
    />
  )
}
