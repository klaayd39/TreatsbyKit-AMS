import { Search, Trash } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { deleteRecipe, recipeHasBatches, saveRecipe } from '../../data/production'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatQuantity } from '../../utils/format'
import { generateId } from '../../utils/id'
import { getAverageCost } from '../../utils/inventory'

function blankLine() {
  return { id: generateId('ingredient'), itemId: '', quantity: '' }
}

function blankRecipe() {
  return {
    name: '',
    finishedItemId: '',
    yieldQuantity: '1',
    notes: '',
    ingredients: [blankLine()],
  }
}

function recipeToForm(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    finishedItemId: recipe.finishedItemId,
    yieldQuantity: String(recipe.yieldQuantity ?? 1),
    notes: recipe.notes || '',
    ingredients: (recipe.ingredients || []).map((line) => ({
      id: line.id || generateId('ingredient'),
      itemId: line.itemId,
      quantity: String(line.quantity),
    })),
  }
}

function estimatedUnitCost(recipe, movements) {
  const yieldQuantity = Number(recipe.yieldQuantity) || 0
  if (yieldQuantity <= 0 || !(recipe.ingredients || []).length) return null
  const total = recipe.ingredients.reduce((sum, line) => {
    const average = getAverageCost(line.itemId, movements) || 0
    return sum + (Number(line.quantity) || 0) * average
  }, 0)
  return total / yieldQuantity
}

export default function RecipesPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notice, setNotice] = useState('')

  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const recipes = getAll(COLLECTIONS.RECIPES)
  const finishedGoods = items
    .filter((item) => item.category === 'finished_good')
    .sort((a, b) => a.name.localeCompare(b.name))
  const ingredients = items
    .filter((item) => item.category === 'raw_material' || item.category === 'packaging')
    .sort((a, b) => a.name.localeCompare(b.name))

  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown item'
  const itemUnit = (itemId) => items.find((item) => item.id === itemId)?.unit || ''

  const filtered = recipes
    .filter((recipe) => {
      const query = search.trim().toLowerCase()
      if (!query) return true
      const ingredientNames = (recipe.ingredients || []).map((line) => itemName(line.itemId)).join(' ')
      return [recipe.name, itemName(recipe.finishedItemId), ingredientNames].join(' ').toLowerCase().includes(query)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  function openCreate() {
    setForm(blankRecipe())
    setErrors({})
    setNotice('')
  }

  function openEdit(recipe) {
    setForm(recipeToForm(recipe))
    setErrors({})
    setNotice('')
  }

  function closeForm() {
    setForm(null)
    setErrors({})
  }

  function updateLine(lineId, changes) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((line) => (line.id === lineId ? { ...line, ...changes } : line)),
    }))
  }

  async function submit(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await saveRecipe(form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    closeForm()
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  function requestDelete(recipe) {
    if (recipeHasBatches(recipe.id)) {
      setNotice(`${recipe.name} has production batches and cannot be deleted.`)
      return
    }
    setNotice('')
    setPendingDelete(recipe)
  }

  async function confirmDelete() {
    setSaving(true)
    try {
    const result = await deleteRecipe(pendingDelete.id)
    setPendingDelete(null)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  const draftCost = form ? estimatedUnitCost(form, movements) : null

  return (
    <>
      <PageHeader
        title="Product Recipes (BOM)"
        description="Each ingredient quantity is for one yield. A yield of 1 with 2 eggs is 2 eggs per pie."
        actions={<Button onClick={openCreate}>Add recipe</Button>}
      />
      {notice ? <p className="mb-4 rounded-lg bg-sand px-3 py-2 text-sm text-ink">{notice}</p> : null}

      {recipes.length === 0 ? (
        <EmptyState
          title="No recipes yet"
          description="Add a bill of materials for a finished good."
          action={<Button onClick={openCreate}>Add recipe</Button>}
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              className={`${controlClass} pl-9`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipes"
              aria-label="Search recipes"
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No recipes match" description="Try another name or ingredient." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Recipe</th>
                  <th scope="col">Finished good</th>
                  <th scope="col">Ingredients</th>
                  <th scope="col" className="text-right">Yield</th>
                  <th scope="col" className="text-right">Est. cost / unit</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((recipe) => {
                  const cost = estimatedUnitCost(recipe, movements)
                  const summary = (recipe.ingredients || [])
                    .map((line) => `${formatQuantity(line.quantity)} ${itemUnit(line.itemId)} ${itemName(line.itemId)}`)
                    .join(', ')
                  return (
                    <tr key={recipe.id}>
                      <td className="font-medium">{recipe.name}</td>
                      <td>{itemName(recipe.finishedItemId)}</td>
                      <td className="max-w-xs">{summary || '—'}</td>
                      <td className="text-right tabular-nums">{formatQuantity(recipe.yieldQuantity)}</td>
                      <td className="text-right tabular-nums">{cost === null ? '—' : formatCurrency(cost)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" onClick={() => openEdit(recipe)}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => requestDelete(recipe)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {form ? (
        <Modal title={form.id ? 'Edit recipe' : 'Add recipe'} onClose={closeForm} size="lg">
          <form className="space-y-4" onSubmit={submit} noValidate>
            {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
            {finishedGoods.length === 0 ? (
              <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">
                Add a finished good before saving a recipe.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Finished good" htmlFor="recipe-product" error={errors.finishedItemId}>
                <select
                  id="recipe-product"
                  className={controlClass}
                  value={form.finishedItemId}
                  onChange={(event) => setForm({ ...form, finishedItemId: event.target.value })}
                >
                  <option value="">Select a finished good</option>
                  {finishedGoods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recipe name" htmlFor="recipe-name" error={errors.name}>
                <input
                  id="recipe-name"
                  className={controlClass}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Yield quantity" htmlFor="recipe-yield" error={errors.yieldQuantity} hint="How many units this recipe makes.">
                <input
                  id="recipe-yield"
                  className={controlClass}
                  inputMode="decimal"
                  value={form.yieldQuantity}
                  onChange={(event) => setForm({ ...form, yieldQuantity: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="recipe-notes">
              <textarea
                id="recipe-notes"
                className={controlClass}
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Ingredients per yield</h2>
                <Button variant="secondary" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, blankLine()] })}>
                  Add ingredient
                </Button>
              </div>
              {errors.lines ? <p className="mb-2 text-sm text-red-800">{errors.lines}</p> : null}
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="min-w-[640px] [&_td]:align-top">
                  <thead className="bg-sand/50">
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Unit</th>
                      <th scope="col" className="text-right">Quantity</th>
                      <th scope="col">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.ingredients.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-sm text-muted">
                          Add at least one ingredient.
                        </td>
                      </tr>
                    ) : (
                      form.ingredients.map((line, index) => {
                        const lineErrors = errors.lineErrors?.[index] || {}
                        return (
                          <tr key={line.id}>
                            <td className="min-w-52">
                              <select
                                className={controlClass}
                                value={line.itemId}
                                aria-label="Ingredient"
                                onChange={(event) => updateLine(line.id, { itemId: event.target.value })}
                              >
                                <option value="">Select an item</option>
                                {ingredients.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                              {lineErrors.itemId ? <p className="mt-1 text-sm text-red-800">{lineErrors.itemId}</p> : null}
                            </td>
                            <td className="text-muted">{line.itemId ? itemUnit(line.itemId) : '—'}</td>
                            <td className="w-32">
                              <input
                                className={`${controlClass} text-right`}
                                inputMode="decimal"
                                aria-label="Quantity per yield"
                                value={line.quantity}
                                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                              />
                              {lineErrors.quantity ? (
                                <p className="mt-1 text-sm text-red-800">{lineErrors.quantity}</p>
                              ) : null}
                            </td>
                            <td className="w-12 text-right">
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-lg text-ink hover:bg-sand"
                                aria-label="Remove ingredient"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    ingredients: form.ingredients.filter((entry) => entry.id !== line.id),
                                  })
                                }
                              >
                                <Trash className="size-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-right text-sm">
                <span className="text-muted">Estimated cost per unit</span>{' '}
                <span className="ml-4 inline-block min-w-28 font-semibold tabular-nums">
                  {draftCost === null ? '—' : formatCurrency(draftCost)}
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>Save recipe</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete recipe"
          message={`Delete ${pendingDelete.name}? Batches already posted are not affected, and this recipe has none.`}
          confirmLabel="Delete recipe"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  )
}
