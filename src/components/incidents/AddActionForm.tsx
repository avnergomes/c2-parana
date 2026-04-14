// src/components/incidents/AddActionForm.tsx
// Form to add a note/action to the incident timeline
import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAddIncidentNote } from '@/hooks/useIncidentActions'

export function AddActionForm({ incidentId }: { incidentId: string }) {
  const [note, setNote] = useState('')
  const addNote = useAddIncidentNote()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = note.trim()
    if (!trimmed) return
    addNote.mutate(
      { incidentId, description: trimmed },
      {
        onSuccess: () => setNote(''),
      },
    )
  }

  const disabled = !note.trim() || addNote.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Adicionar nota ou observacao..."
        rows={3}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border border-border',
          'bg-background-secondary text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:ring-1 focus:ring-accent-green',
          'resize-none',
        )}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {note.length}/2000
        </p>
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
            'bg-accent-green text-white hover:bg-accent-green/90',
            'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          )}
        >
          {addNote.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Send size={12} />
          )}
          Registrar
        </button>
      </div>
      {addNote.isError && (
        <p className="text-xs text-red-400">
          Erro ao salvar nota
        </p>
      )}
    </form>
  )
}
