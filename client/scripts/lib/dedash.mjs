// Turn an em dash in prose into ordinary punctuation.
//
// The dash in this copy almost always joins a statement to the explanation of
// it. Which mark replaces it depends on what sits either side, and getting
// that wrong is worse than leaving the dash alone:
//
//   * A comma, normally — what follows cannot stand on its own.
//   * A comma too when the next word carries the sentence onward ("and", "not",
//     "because"). A colon there promises a definition that never arrives:
//     "see everything that moves with it: and every project already priced on
//     it" is not a sentence anybody wrote.
//   * A full stop when what follows CAN stand alone, because a comma would
//     splice two sentences ("she says so — she does not fill the gap").
//   * A colon when the half BEFORE already carries commas and what follows
//     merely names or lists, because a third comma turns it into soup:
//     "Sales, support, training or press, pick the route that fits".
//
// En dashes are deliberately untouched: they are ranges (9am–6pm) and mean
// something else entirely.

const EM_DASH = "—";

// Words that carry the previous clause onward rather than opening a new one.
const CONTINUATION =
  /^(and|or|but|so|yet|nor|then|not|never|no|rather|instead|just|only|because|which|who|whose|while|though|although|until|unless|before|after|since|if|when)\b/i;

// A clause that could stand alone usually opens with one of these...
const SUBJECT =
  /^(it|he|she|they|we|you|i|this|that|these|those|there|his|her|their|our|your|its|the|a|an|every|each|both|most|nothing|nobody|everything|anyone|someone)\b/i;

// ...followed closely by a verb.
const VERB =
  /^\s*(?:\S+\s+){1,3}(is|are|was|were|has|have|had|does|do|did|can|could|will|would|should|must|may|might|says|said|reads|shows|means|makes|takes|gives|goes|comes|keeps|stays|sits|runs|works|costs|counts|carries|needs|wants|knows|gets|puts|sends|opens|closes|starts|stops|holds|leaves|lets|becomes|remains|looks|feels|seems|turns|brings|writes|prices|measures|installs|activates|renews|expires|keep|run|work|cost|count|carry|need|want|know|get|put|send|open|close|start|stop|hold|leave|let|become|remain|look|feel|seem|turn|bring|write|price|measure|install|activate|renew|expire|stay|sit|go|come|take|give|make|show|mean|read|say)\b/i;

// An instruction stands alone too, and opens with a bare verb.
const IMPERATIVE =
  /^(pick|see|choose|start|book|tell|upload|ask|read|use|get|try|take|send|open|call|visit|download|install|check|bring|keep|let|make|find|talk|write|price|measure|compare|explore|learn|join|sign|buy|watch|unlock|add|remove|edit|save|enter|select|review|confirm|contact|drag|drop|click|tap|scroll|switch|swap|rename|delete|export|import|print|share|copy|paste|set|clear|reset|apply|submit|update|manage)\b/i;

/**
 * @param {string} text  prose that may contain em dashes
 * @returns {string}     the same prose, punctuated without them
 */
export function dedash(text) {
  if (typeof text !== "string" || !text.includes(EM_DASH)) return text;

  let out = "";
  let rest = text;

  for (;;) {
    const at = rest.indexOf(EM_DASH);
    if (at < 0) {
      out += rest;
      break;
    }

    // The dash plus whatever spacing hugs it.
    let start = at;
    while (start > 0 && /\s/.test(rest[start - 1])) start -= 1;
    let end = at + 1;
    while (end < rest.length && /\s/.test(rest[end])) end += 1;

    const before = rest.slice(0, start);
    const after = rest.slice(end);

    // Only the current sentence counts when asking whether this half already
    // has commas; an earlier sentence's commas say nothing about this one.
    const sentence = before.split(/(?<=[.!?])\s+/).pop() || "";

    const carriesOn = CONTINUATION.test(after);
    const standsAlone =
      !carriesOn && ((SUBJECT.test(after) && VERB.test(after)) || IMPERATIVE.test(after));

    let mark;
    if (standsAlone) mark = ". ";
    // A colon when either half is a list: "Tell me what you do — estimating,
    // take-off, BIM" is an enumeration, and a comma buries its first item
    // among the rest.
    else if (!carriesOn && (sentence.includes(",") || /^[^.!?]*,/.test(after))) mark = ": ";
    else mark = ", ";

    out += before + mark;
    // A full stop takes a capital after it.
    rest = mark === ". " ? after.charAt(0).toUpperCase() + after.slice(1) : after;
  }

  return out;
}

export default dedash;
