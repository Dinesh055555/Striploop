// Field screens (collector and aggregation point) in English, Hindi and Gujarati.
import { useEffect, useState } from "react";

export const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "hi", label: "हि", name: "हिन्दी" },
  { code: "gu", label: "ગુ", name: "ગુજરાતી" },
];

const T = {
  route: ["Today's route", "आज का रूट", "આજનો રૂટ"],
  scan: ["Scan and weigh", "स्कैन और तौल", "સ્કેન અને વજન"],
  earnings: ["Earnings", "कमाई", "કમાણી"],
  stopsDone: ["{d} of {t} stops done", "{t} में से {d} स्टॉप पूरे", "{t} માંથી {d} સ્ટોપ પૂરા"],
  startPickup: ["Start pickup", "पिकअप शुरू करें", "પિકઅપ શરૂ કરો"],
  pending: ["Waiting", "बाकी", "બાકી"],
  done: ["Done", "पूरा", "પૂર્ણ"],
  binsWaiting: ["Bins waiting: {n}", "बाकी डिब्बे: {n}", "બાકી ડબ્બા: {n}"],
  pickedToday: ["Picked today: {n}", "आज उठाए: {n}", "આજે ઉપાડ્યા: {n}"],
  step: ["Step {n} of 5", "चरण {n} / 5", "પગલું {n} / 5"],
  step1: ["Scan the bin QR", "डिब्बे का QR स्कैन करें", "ડબ્બાનો QR સ્કેન કરો"],
  tapToScan: ["Tap a bin to scan it", "स्कैन करने के लिए डिब्बे पर टैप करें", "સ્કેન કરવા ડબ્બા પર ટેપ કરો"],
  orType: ["Or type the bin code", "या डिब्बे का कोड लिखें", "અથવા ડબ્બાનો કોડ લખો"],
  find: ["Find bin", "डिब्बा खोजें", "ડબ્બો શોધો"],
  useCamera: ["Use phone camera", "फोन का कैमरा चालू करें", "ફોનનો કેમેરા ચાલુ કરો"],
  stopCamera: ["Stop camera", "कैमरा बंद करें", "કેમેરા બંધ કરો"],
  step2: ["Check the seal number", "सील नंबर जाँचें", "સીલ નંબર તપાસો"],
  sealHint: ["Type the number printed on the plastic seal", "प्लास्टिक सील पर छपा नंबर लिखें", "પ્લાસ્ટિક સીલ પર છાપેલો નંબર લખો"],
  fillSeal: ["Demo: read seal from label", "डेमो: लेबल से सील भरें", "ડેમો: લેબલમાંથી સીલ ભરો"],
  step3: ["Weigh the bin", "डिब्बे का वजन करें", "ડબ્બાનું વજન કરો"],
  kg: ["kg", "किलो", "કિલો"],
  step4: ["Take a photo", "फोटो लें", "ફોટો લો"],
  photoHint: ["Photo of the sealed bin on the scale", "तराजू पर रखे सील बंद डिब्बे की फोटो", "વજનકાંટા પર મૂકેલા સીલબંધ ડબ્બાનો ફોટો"],
  takePhoto: ["Open camera", "कैमरा खोलें", "કેમેરા ખોલો"],
  retake: ["Retake", "फिर से लें", "ફરી લો"],
  skipPhoto: ["Continue without photo", "बिना फोटो आगे बढ़ें", "ફોટો વગર આગળ વધો"],
  step5: ["Confirm handover", "सौंपना पक्का करें", "સોંપણી પાકી કરો"],
  confirm: ["Confirm pickup", "पिकअप पक्का करें", "પિકઅપ પાકું કરો"],
  next: ["Next", "आगे", "આગળ"],
  back: ["Back", "पीछे", "પાછળ"],
  saved: ["Pickup saved", "पिकअप सेव हुआ", "પિકઅપ સેવ થયું"],
  savedOffline: ["Saved on this phone", "इस फोन में सेव हुआ", "આ ફોનમાં સેવ થયું"],
  youEarned: ["You earned", "आपकी कमाई", "તમારી કમાણી"],
  nextStop: ["Back to route", "रूट पर वापस", "રૂટ પર પાછા"],
  offline: ["No internet. Pickups are saved on this phone and will send when you are back online.", "इंटरनेट नहीं है। पिकअप इस फोन में सेव हैं, इंटरनेट आने पर भेज दिए जाएँगे।", "ઇન્ટરનેટ નથી. પિકઅપ આ ફોનમાં સેવ છે, ઇન્ટરનેટ આવતાં મોકલાઈ જશે."],
  queued: ["Pickups waiting to send: {n}", "भेजने बाकी पिकअप: {n}", "મોકલવાના બાકી પિકઅપ: {n}"],
  sendNow: ["Send now", "अभी भेजें", "હમણાં મોકલો"],
  today: ["Today", "आज", "આજે"],
  thisWeek: ["Last 7 days", "पिछले 7 दिन", "છેલ્લા 7 દિવસ"],
  payouts: ["UPI payouts", "UPI भुगतान", "UPI ચુકવણી"],
  loan: ["My Satin loan", "मेरा सैटिन लोन", "મારી સૅટિન લોન"],
  outstanding: ["Left to repay", "चुकाना बाकी", "ચૂકવવાનું બાકી"],
  emi: ["Monthly EMI", "मासिक EMI", "માસિક EMI"],
  nextDue: ["Next due", "अगली तारीख", "આગલી તારીખ"],
  pickups: ["Pickups", "पिकअप", "પિકઅપ"],
  location: ["Location and time recorded", "जगह और समय दर्ज", "સ્થળ અને સમય નોંધાયા"],
  approxLocation: ["Approximate location (stop address)", "अनुमानित जगह (स्टॉप का पता)", "અંદાજિત સ્થળ (સ્ટોપનું સરનામું)"],
  noStops: ["All stops done for today", "आज के सभी स्टॉप पूरे", "આજના બધા સ્ટોપ પૂરા"],
  rateCard: ["Rate per kg", "प्रति किलो दर", "પ્રતિ કિલો દર"],
  paid: ["Paid", "भुगतान हुआ", "ચૂકવાયું"],
  choose: ["Choose a stop on your route first", "पहले रूट से स्टॉप चुनें", "પહેલાં રૂટમાંથી સ્ટોપ પસંદ કરો"],
  // aggregation point
  intake: ["Intake", "माल प्राप्ति", "માલ આવક"],
  recon: ["Weight check", "वजन मिलान", "વજન મેળવણી"],
  baling: ["Sorting and baling", "छँटाई और गठ्ठर", "છટણી અને ગાંસડી"],
  awaitingIntake: ["Bins arriving from collectors", "कलेक्टरों से आए डिब्बे", "કલેક્ટરો પાસેથી આવેલા ડબ્બા"],
  collectorWeight: ["Collector weight", "कलेक्टर का वजन", "કલેક્ટરનું વજન"],
  scaleWeight: ["Your scale weight", "आपके तराजू का वजन", "તમારા કાંટાનું વજન"],
  gap: ["Gap", "अंतर", "તફાવત"],
  withinTol: ["Within tolerance", "सीमा के अंदर", "મર્યાદામાં"],
  overTol: ["Above tolerance, will be flagged", "सीमा से ज़्यादा, फ्लैग होगा", "મર્યાદા કરતાં વધુ, ફ્લેગ થશે"],
  recordIntake: ["Record intake", "प्राप्ति दर्ज करें", "આવક નોંધો"],
  makeBale: ["Make bale", "गठ्ठर बनाएँ", "ગાંસડી બનાવો"],
  dispatch: ["Dispatch to hub", "हब भेजें", "હબ પર મોકલો"],
  weightIn: ["Weight in", "आया वजन", "આવેલું વજન"],
  weightOut: ["Weight recorded here", "यहाँ दर्ज वजन", "અહીં નોંધાયેલું વજન"],
  readyToBale: ["Ready to bale", "गठ्ठर के लिए तैयार", "ગાંસડી માટે તૈયાર"],
  bales: ["Bales", "गठ्ठर", "ગાંસડીઓ"],
  nothingWaiting: ["Nothing waiting. New bins appear here when collectors confirm a pickup.", "कुछ बाकी नहीं। कलेक्टर पिकअप पक्का करेंगे तो डिब्बे यहाँ दिखेंगे।", "કંઈ બાકી નથી. કલેક્ટર પિકઅપ પાકું કરશે ત્યારે ડબ્બા અહીં દેખાશે."],
};

const idx = { en: 0, hi: 1, gu: 2 };

export function useLang() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("sl-lang") || "en"; } catch { return "en"; }
  });
  useEffect(() => { try { localStorage.setItem("sl-lang", lang); } catch {} }, [lang]);
  const t = (key, vars = {}) => {
    const row = T[key];
    let s = row ? row[idx[lang]] || row[0] : key;
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
  return { lang, setLang, t };
}
