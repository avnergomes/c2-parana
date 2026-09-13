// supabase/functions/etl-maritimo/frame.ts
//
// A AISStream envia os JSON em quadros WebSocket BINARIOS. Com o binaryType
// default do Deno ('blob'), decodificar o quadro como ArrayBuffer lanca e cada
// mensagem virava parse_error (diagnostico 2026-09-13). collectVessels agora
// pede 'arraybuffer', e esta funcao aceita qualquer forma por seguranca.

/** Texto de um quadro WebSocket: string, ArrayBuffer, view tipada ou Blob. */
export async function frameToText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
  if (data instanceof Blob) return await data.text()
  throw new TypeError(`quadro WebSocket de tipo inesperado: ${Object.prototype.toString.call(data)}`)
}
