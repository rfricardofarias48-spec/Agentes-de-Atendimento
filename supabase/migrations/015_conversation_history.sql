-- =============================================
-- Histórico de conversa (curto prazo, literal)
-- =============================================
-- Guarda as últimas mensagens trocadas com o paciente para dar
-- contexto multi-turno ao modelo (ex.: agente pergunta "segunda,
-- quarta ou sexta?" e o paciente responde só "quarta" — sem esse
-- histórico o modelo não sabe do que se trata).
--
-- Isso é DIFERENTE do mem0 (memória semântica de longo prazo, guarda
-- fatos extraídos): aqui é o texto literal das últimas trocas, usado
-- só pra manter o fio da conversa atual. As duas memórias são
-- complementares e continuam existindo em paralelo.
--
-- Formato de cada item: { "role": "user" | "assistant", "content": string, "ts": string (ISO) }
-- O corte para no máximo N itens é feito na aplicação (agentService.ts)
-- e reforçado atomicamente pela função append_conversation_history abaixo.

alter table conversations
  add column if not exists history jsonb not null default '[]'::jsonb;

comment on column conversations.history is
  'Histórico literal das últimas mensagens (curto prazo) para contexto multi-turno do agente. Complementar ao mem0 (memória semântica de longo prazo). Formato: array de { role: "user"|"assistant", content: string, ts: string ISO }, limitado a HISTORY_MAX_MESSAGES itens (ver agentService.ts).';

-- Função que faz o append de novos itens ao histórico de forma atômica,
-- evitando que duas mensagens simultâneas do mesmo paciente se
-- sobrescrevam (race condition de read-then-update no lado da aplicação).
-- Mantém apenas os ÚLTIMOS max_items (mais recentes por `ts`), em ordem
-- cronológica crescente no array resultante.
create or replace function append_conversation_history(
  conversation_id uuid,
  new_items jsonb,
  max_items int default 20
) returns jsonb
language plpgsql
as $$
declare
  merged jsonb;
  result jsonb;
begin
  select coalesce(history, '[]'::jsonb) || coalesce(new_items, '[]'::jsonb)
  into merged
  from conversations
  where id = conversation_id;

  if merged is null then
    return null; -- conversa não encontrada
  end if;

  -- Pega os últimos max_items por `ts` (mais recentes) e reordena
  -- cronologicamente (mais antigo → mais novo) para salvar.
  select coalesce(jsonb_agg(elem order by (elem->>'ts') asc), '[]'::jsonb)
  into result
  from (
    select elem
    from jsonb_array_elements(merged) elem
    order by (elem->>'ts') desc
    limit greatest(max_items, 0)
  ) recent;

  update conversations set history = result where id = conversation_id;

  return result;
end;
$$;

grant execute on function append_conversation_history(uuid, jsonb, int) to service_role;
