// Async questions outlive tool calls and can be answered independently while work
// continues. Store identities only; never retain prompt or answer contents.
export interface AsyncQuestion { id: string; askedAt: number; count: number; accepted: boolean }
export interface QuestionReply { readonly id: string; readonly index: number; readonly answeredAt: number }
export interface QuestionState { requests: AsyncQuestion[]; replies: readonly QuestionReply[]; observedAt: number }
export const questionLifetime = 15 * 60 * 1000;
const maxQuestions = 32;

export function unansweredQuestions(state: QuestionState | undefined, now = Date.now()): AsyncQuestion[] {
  return (state?.requests || []).filter(request => request.accepted && request.askedAt <= now + 5000
    && now - request.askedAt <= questionLifetime && pendingQuestionIndices(request, state?.replies).length > 0);
}

export function pendingQuestionIndices(request: AsyncQuestion, replies: readonly QuestionReply[] = []): number[] {
  const answered = new Set(replies.filter(reply => reply.id === request.id).map(reply => reply.index));
  return Array.from({ length: request.count }, (_, index) => index).filter(index => !answered.has(index));
}

export function reduceQuestions(previous: QuestionState | undefined, record: any, now: number): QuestionState | undefined {
  const time = Date.parse(record?.timestamp), p = record?.payload;
  if (!Number.isFinite(time) || time > now + 5000 || time < (previous?.observedAt || 0) || !p || typeof p !== 'object') return previous;
  let state = previous;
  const texts = record.type === 'event_msg' && p.type === 'user_message' ? [p.message]
    : record.type === 'response_item' && p.type === 'message' && p.role === 'user' && Array.isArray(p.content)
      ? p.content.filter((item: any) => item?.type === 'input_text').map((item: any) => item.text) : [];
  for (const text of texts) {
    if (typeof text !== 'string' || text.length > 65536) continue;
    const match = /^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/.exec(text);
    if (!match) continue;
    try {
      const replies = JSON.parse(match[1]);
      if (!Array.isArray(replies)) continue;
      for (const reply of replies.slice(0, maxQuestions)) {
        if (typeof reply?.questionItemId !== 'string' || reply.questionItemId.length > 512
          || typeof reply.question !== 'string' || typeof reply.answer !== 'string') continue;
        let identity;
        try { identity = JSON.parse(reply.questionItemId); } catch { continue; }
        if (!Array.isArray(identity) || identity.length !== 3 || identity[0] !== 'request_user_input_async'
          || typeof identity[1] !== 'string' || !identity[1].length || identity[1].length > 200
          || !Number.isSafeInteger(identity[2]) || identity[2] < 0 || identity[2] >= maxQuestions) continue;
        const retained = (state?.replies || []).filter(item => item.id !== identity[1] || item.index !== identity[2]);
        retained.push({ id: identity[1], index: identity[2], answeredAt: time });
        state = { requests: state?.requests || [], replies: retained.slice(-1024), observedAt: time };
      }
    } catch { /* Ordinary and malformed messages are not answer evidence. */ }
  }
  if (record.type !== 'response_item' || typeof p.call_id !== 'string' || !p.call_id.length || p.call_id.length > 200) return state;
  if (p.type === 'function_call' && ['request_user_input_async', 'functions.request_user_input_async'].includes(p.name)) {
    // A duplicate call must not renew an old question's lifetime or erase answers.
    if (state?.requests.some(request => request.id === p.call_id)) return state;
    try {
      if (typeof p.arguments !== 'string' || p.arguments.length > 65536) return state;
      const questions = JSON.parse(p.arguments)?.questions;
      if (!Array.isArray(questions) || questions.length < 1 || questions.length > maxQuestions
        || questions.some(question => typeof question?.title !== 'string' || !question.title.trim())) return state;
      const requests = [...(state?.requests || []).filter(request => time - request.askedAt <= questionLifetime),
        { id: p.call_id, askedAt: time, count: questions.length, accepted: false }].slice(-32);
      return { requests, replies: state?.replies || [], observedAt: time };
    } catch { return state; }
  }
  if (p.type === 'function_call_output' && state?.requests.some(request => request.id === p.call_id && !request.accepted)) {
    let accepted = false;
    try { accepted = typeof p.output === 'string' && p.output.length <= 65536 && JSON.parse(p.output)?.accepted === true; } catch { /* Rejected call. */ }
    return { ...state, observedAt: time, requests: accepted
      ? state.requests.map(request => request.id === p.call_id ? { ...request, accepted: true } : request)
      : state.requests.filter(request => request.id !== p.call_id) };
  }
  return state;
}
