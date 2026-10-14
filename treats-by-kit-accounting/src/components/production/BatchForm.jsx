import { useState } from 'react'
import Button from '../ui/Button'
import Field, { controlClass } from '../ui/Field'
import { prepareBatchLines, saveBatch } from '../../data/production'
import { formatCurrency, formatQuantity } from '../../utils/format'
import { calculateBatchCost, checkStockAvailability } from '../../utils/production'

function linesFor(recipe, quantity) {
  if (!recipe || !(Number(quantity) > 0)) return []
  return prepareBatchLines(recipe, quantity).map((line) => ({
    ...line,
    actualQty: String(line.actualQty),
    wasteQty: '0',
  }))
}

export default function BatchForm({ plan, recipes, onCancel, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(() => {
    const recipe = recipes.find((entry) => entry.id === plan?.recipeId)
    const quantity = plan?.quantity ?? ''
    return {
      batchNumber: plan?.batchNumber || '',
      date: plan?.date || '',
      recipeId: plan?.recipeId || '',
      quantityProduced: quantity === '' || quantity === undefined ? '' : String(quantity),
      notes: '',
      laborCost: '0',
      overheadCost: '0',
      lines: linesFor(recipe, quantity),
    }
  })
  const [errors, setErrors] = useState({})

  const costs = calculateBatchCost(draft.lines, draft.laborCost, draft.overheadCost, draft.quantityProduced)
  const shortages = checkStockAvailability(draft.lines)
  const shortIds = new Set(shortages.map((line) => line.itemId))

  function changeRecipe(recipeId) {
    const recipe = recipes.find((entry) => entry.id === recipeId)
    setDraft((current) => ({
      ...current,
      recipeId,
      lines: linesFor(recipe, current.quantityProduced),
    }))
  }

  function changeQuantity(quantityProduced) {
    setDraft((current) => {
      const recipe = recipes.find((entry) => entry.id === current.recipeId)
      return {
        ...current,
        quantityProduced,
        lines: linesFor(recipe, quantityProduced),
      }
    })
  }

  function updateLine(lineId, changes) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)),
    }))
  }

  async function submit(event) {
    setSaving(true)
    try {
      event.preventDefault()
      const result = await saveBatch(draft)
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      onSaved(result.batch)
      } finally {
      setSaving(false)
    }
}

  return (
    <form className="space-y-6" onSubmit={submit} noValidate>
      {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Batch number" htmlFor="batch-number" error={errors.batchNumber}>
          <input
            id="batch-number"
            className={controlClass}
            value={draft.batchNumber}
            onChange={(event) => setDraft({ ...draft, batchNumber: event.target.value })}
          />
        </Field>
        <Field label="Date" htmlFor="batch-date" error={errors.date}>
          <input
            id="batch-date"
            type="date"
            className={controlClass}
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </Field>
        <Field label="Recipe" htmlFor="batch-recipe" error={errors.recipeId}>
          <select
            id="batch-recipe"
            className={controlClass}
            value={draft.recipeId}
            onChange={(event) => changeRecipe(event.target.value)}
          >
            <option value="">Select a recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Quantity produced"
          htmlFor="batch-quantity"
          error={errors.quantityProduced}
          hint="Scales the recipe. Yield is already included in each ingredient quantity."
        >
          <input
            id="batch-quantity"
            className={controlClass}
            inputMode="decimal"
            value={draft.quantityProduced}
            onChange={(event) => changeQuantity(event.target.value)}
          />
        </Field>
        <Field label="Labor cost" htmlFor="batch-labor" error={errors.laborCost}>
          <input
            id="batch-labor"
            className={controlClass}
            inputMode="decimal"
            value={draft.laborCost}
            onChange={(event) => setDraft({ ...draft, laborCost: event.target.value })}
          />
        </Field>
        <Field label="Overhead cost" htmlFor="batch-overhead" error={errors.overheadCost}>
          <input
            id="batch-overhead"
            className={controlClass}
            inputMode="decimal"
            value={draft.overheadCost}
            onChange={(event) => setDraft({ ...draft, overheadCost: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="batch-notes">
        <textarea
          id="batch-notes"
          className={controlClass}
          rows={2}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </Field>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Ingredients</h2>
        {shortages.length ? (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Not enough stock:{' '}
            {shortages.map((line) => `${line.name} (short ${formatQuantity(line.shortfall)} ${line.unit})`).join(', ')}.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="min-w-[760px]">
            <thead className="bg-sand/50">
              <tr>
                <th scope="col">Ingredient</th>
                <th scope="col" className="text-right">Expected</th>
                <th scope="col" className="text-right">Actual used</th>
                <th scope="col" className="text-right">Waste</th>
                <th scope="col" className="text-right">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted">
                    Choose a recipe and a quantity to fill the ingredients.
                  </td>
                </tr>
              ) : (
                draft.lines.map((line, index) => {
                  const lineErrors = errors.lineErrors?.[index] || {}
                  return (
                    <tr key={line.id} className={shortIds.has(line.itemId) ? 'bg-red-50' : undefined}>
                      <td>
                        {line.name} <span className="text-muted">{line.unit}</span>
                      </td>
                      <td className="text-right tabular-nums">{formatQuantity(line.expectedQty)}</td>
                      <td className="w-32">
                        <input
                          className={`${controlClass} text-right`}
                          inputMode="decimal"
                          aria-label={`Actual used ${line.name}`}
                          value={line.actualQty}
                          onChange={(event) => updateLine(line.id, { actualQty: event.target.value })}
                        />
                        {lineErrors.actualQty ? (
                          <p className="mt-1 text-sm text-red-800">{lineErrors.actualQty}</p>
                        ) : null}
                      </td>
                      <td className="w-32">
                        <input
                          className={`${controlClass} text-right`}
                          inputMode="decimal"
                          aria-label={`Waste ${line.name}`}
                          value={line.wasteQty}
                          onChange={(event) => updateLine(line.id, { wasteQty: event.target.value })}
                        />
                        {lineErrors.wasteQty ? (
                          <p className="mt-1 text-sm text-red-800">{lineErrors.wasteQty}</p>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">{formatCurrency(line.unitCost)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1 text-right text-sm">
          <p>
            <span className="text-muted">Ingredient cost</span>{' '}
            <span className="ml-4 inline-block min-w-28 font-medium tabular-nums">{formatCurrency(costs.ingredientCost)}</span>
          </p>
          <p>
            <span className="text-muted">Waste cost</span>{' '}
            <span className="ml-4 inline-block min-w-28 font-medium tabular-nums">{formatCurrency(costs.wasteCost)}</span>
          </p>
          <p>
            <span className="text-muted">Total batch cost</span>{' '}
            <span className="ml-4 inline-block min-w-28 font-medium tabular-nums">{formatCurrency(costs.totalCost)}</span>
          </p>
          <p>
            <span className="text-muted">Cost per unit</span>{' '}
            <span className="ml-4 inline-block min-w-28 text-base font-semibold tabular-nums">
              {formatCurrency(costs.costPerUnit)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>Save batch</Button>
      </div>
    </form>
  )
}
