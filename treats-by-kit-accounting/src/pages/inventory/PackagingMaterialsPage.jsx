import ItemCatalog from '../../components/inventory/ItemCatalog'

export default function PackagingMaterialsPage() {
  return (
    <ItemCatalog
      category="packaging"
      title="Packaging"
      description="Boxes and packs. In stock goes up when a supplier delivery is received."
      emptyTitle="No packaging yet"
      emptyDescription="Add boxes or packs if you want to track them."
    />
  )
}
