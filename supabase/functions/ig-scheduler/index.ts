// =====================================================================
// ig-scheduler: o carteiro. Roda a cada 1 minuto (pg_cron).
//   1) Esvazia a fila do freio (ig_send_queue).
//   2) Manda os passos com atraso que já venceram (ig_scheduled).
// Protegido pelo header x-sched-key = SCHED_SECRET.
// Publique com  --no-verify-jwt  (quem protege é o SCHED_SECRET).
// =====================================================================
import {
  afterStep, db, findStep, firstStep, json, logDelivery, schedAutorizado, sendStep, tipoDoPasso,
} from "../_shared/ig.ts";

const MAX_TENTATIVAS = 5;
const VALIDADE_COMENTARIO_MS = 7 * 24 * 3600 * 1000; // ~7 dias (janela do Instagram)

Deno.serve(async (req) => {
  if (!schedAutorizado(req)) return json({ erro: "não autorizado" }, 401);

  const resumo = { fila_enviados: 0, fila_expirados: 0, fila_erros: 0, agendados_enviados: 0 };

  // -------------------------------------------------------------------
  // 1) Fila do freio.
  // -------------------------------------------------------------------
  const { data: fila } = await db.from("ig_send_queue").select("*").eq("status", "pendente")
    .order("created_at", { ascending: true }).limit(30);

  for (const item of fila ?? []) {
    // Comentário velho demais: o Instagram não aceita mais resposta privada.
    if (Date.now() - new Date(item.created_at).getTime() > VALIDADE_COMENTARIO_MS) {
      await db.from("ig_send_queue").update({ status: "expirado" }).eq("id", item.id);
      resumo.fila_expirados++;
      continue;
    }

    const { data: auto } = await db.from("ig_automations").select("*").eq("id", item.automation_id).maybeSingle();
    const step = firstStep(auto);
    if (!auto || !step) {
      await db.from("ig_send_queue").update({ status: "erro", last_error: "automação apagada ou vazia" }).eq("id", item.id);
      continue;
    }

    // Pede uma ficha ao freio. Sem ficha, para por aqui e tenta no próximo minuto.
    const { data: pode } = await db.rpc("take_send_slot", { p_key: "private_reply" });
    if (!pode) break;

    const res = await sendStep({ comment_id: item.comment_id }, auto, step);
    await db.rpc("record_send_result", { p_key: "private_reply", p_ok: res.ok, p_hard: !!res.hard });
    await logDelivery({
      ig_user_id: item.ig_user_id, automation_id: auto.id, canal: "private_reply", tipo: tipoDoPasso(step),
      status: res.ok ? "ok" : "erro", motivo: res.ok ? "enviado pela fila" : res.error,
    });

    if (res.ok) {
      await db.from("ig_send_queue").update({ status: "enviado", sent_at: new Date().toISOString() }).eq("id", item.id);
      await afterStep(item.ig_user_id, auto, step);
      resumo.fila_enviados++;
    } else {
      const tentativas = (item.tentativas ?? 0) + 1;
      await db.from("ig_send_queue").update({
        tentativas,
        last_error: res.error,
        status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
      }).eq("id", item.id);
      resumo.fila_erros++;
      if (res.hard) break; // bloqueio: para tudo, o disjuntor cuida
    }
  }

  // -------------------------------------------------------------------
  // 2) Passos com atraso que já venceram (vão pela DM).
  // -------------------------------------------------------------------
  const { data: agendados } = await db.from("ig_scheduled").select("*").eq("sent", false)
    .lte("send_at", new Date().toISOString()).order("send_at").limit(50);

  for (const ag of agendados ?? []) {
    // Marca antes de enviar, pra não mandar duas vezes se o robô rodar em paralelo.
    const { data: marcado } = await db.from("ig_scheduled").update({ sent: true })
      .eq("id", ag.id).eq("sent", false).select("id");
    if (!marcado?.length) continue;

    const { data: auto } = await db.from("ig_automations").select("*").eq("id", ag.automation_id).maybeSingle();
    const step = findStep(auto, ag.step_id);
    if (!auto || !auto.active || !step) continue;

    const res = await sendStep({ id: ag.ig_user_id }, auto, step);
    await logDelivery({
      ig_user_id: ag.ig_user_id, automation_id: auto.id, canal: "dm", tipo: tipoDoPasso(step),
      status: res.ok ? "ok" : "erro", motivo: res.ok ? "envio com atraso" : res.error,
    });
    if (res.ok) {
      await afterStep(ag.ig_user_id, auto, step);
      resumo.agendados_enviados++;
    }
  }

  // Faxina: apaga o "já processei" com mais de 7 dias.
  await db.from("ig_processed_events").delete().lt("ts", new Date(Date.now() - VALIDADE_COMENTARIO_MS).toISOString());

  return json(resumo);
});
