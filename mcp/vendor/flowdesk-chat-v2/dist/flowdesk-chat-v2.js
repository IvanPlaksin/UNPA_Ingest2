import { jsxs as T, jsx as g, Fragment as Jt } from "react/jsx-runtime";
import je, { createContext as Jn, useContext as Yn, useMemo as xt, useRef as ae, useCallback as Se, useState as ne, useEffect as te, createElement as Ui } from "react";
import { createPortal as qi } from "react-dom";
const $ = (e) => typeof e == "string", dt = () => {
  let e, t;
  const n = new Promise((r, i) => {
    e = r, t = i;
  });
  return n.resolve = e, n.reject = t, n;
}, Er = (e) => e == null ? "" : String(e), Ls = (e, t, n) => {
  e.forEach((r) => {
    t[r] && (n[r] = t[r]);
  });
}, As = /###/g, Nr = (e) => e && e.includes("###") ? e.replace(As, ".") : e, Ir = (e) => !e || $(e), kt = (e, t, n) => {
  const r = $(t) ? t.split(".") : t;
  let i = 0;
  for (; i < r.length - 1; ) {
    if (Ir(e)) return {};
    const a = Nr(r[i]);
    !e[a] && n && (e[a] = new n()), Object.prototype.hasOwnProperty.call(e, a) ? e = e[a] : e = {}, ++i;
  }
  return Ir(e) ? {} : {
    obj: e,
    k: Nr(r[i])
  };
}, Tr = (e, t, n) => {
  const {
    obj: r,
    k: i
  } = kt(e, t, Object);
  if (r !== void 0 || t.length === 1) {
    r[i] = n;
    return;
  }
  let a = t[t.length - 1], s = t.slice(0, t.length - 1), o = kt(e, s, Object);
  for (; o.obj === void 0 && s.length; )
    a = `${s[s.length - 1]}.${a}`, s = s.slice(0, s.length - 1), o = kt(e, s, Object), o?.obj && typeof o.obj[`${o.k}.${a}`] < "u" && (o.obj = void 0);
  o.obj[`${o.k}.${a}`] = n;
}, Rs = (e, t, n, r) => {
  const {
    obj: i,
    k: a
  } = kt(e, t, Object);
  i[a] = i[a] || [], i[a].push(n);
}, Vt = (e, t) => {
  const {
    obj: n,
    k: r
  } = kt(e, t);
  if (n && Object.prototype.hasOwnProperty.call(n, r))
    return n[r];
}, Os = (e, t, n) => {
  const r = Vt(e, n);
  return r !== void 0 ? r : Vt(t, n);
}, Ki = (e, t, n) => {
  for (const r in t)
    r !== "__proto__" && r !== "constructor" && (Object.prototype.hasOwnProperty.call(e, r) ? $(e[r]) || e[r] instanceof String || $(t[r]) || t[r] instanceof String ? n && (e[r] = t[r]) : Ki(e[r], t[r], n) : e[r] = t[r]);
  return e;
}, Pe = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), Ps = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
}, Ds = (e) => $(e) ? e.replace(/[&<>"'\/]/g, (t) => Ps[t]) : e;
class _s {
  constructor(t) {
    this.capacity = t, this.regExpMap = /* @__PURE__ */ new Map(), this.regExpQueue = [];
  }
  getRegExp(t) {
    const n = this.regExpMap.get(t);
    if (n !== void 0)
      return n;
    const r = new RegExp(t);
    return this.regExpQueue.length === this.capacity && this.regExpMap.delete(this.regExpQueue.shift()), this.regExpMap.set(t, r), this.regExpQueue.push(t), r;
  }
}
const Fs = [" ", ",", "?", "!", ";"], Ms = new _s(20), zs = (e, t, n) => {
  t = t || "", n = n || "";
  const r = Fs.filter((s) => !t.includes(s) && !n.includes(s));
  if (r.length === 0) return !0;
  const i = Ms.getRegExp(`(${r.map((s) => s === "?" ? "\\?" : s).join("|")})`);
  let a = !i.test(e);
  if (!a) {
    const s = e.indexOf(n);
    s > 0 && !i.test(e.substring(0, s)) && (a = !0);
  }
  return a;
}, On = (e, t, n = ".") => {
  if (!e) return;
  if (e[t])
    return Object.prototype.hasOwnProperty.call(e, t) ? e[t] : void 0;
  const r = t.split(n);
  let i = e;
  for (let a = 0; a < r.length; ) {
    if (!i || typeof i != "object")
      return;
    let s, o = "";
    for (let u = a; u < r.length; ++u)
      if (u !== a && (o += n), o += r[u], s = i[o], s !== void 0) {
        if (["string", "number", "boolean"].includes(typeof s) && u < r.length - 1)
          continue;
        a += u - a + 1;
        break;
      }
    i = s;
  }
  return i;
}, Et = (e) => e?.replace(/_/g, "-"), js = {
  type: "logger",
  log(e) {
    this.output("log", e);
  },
  warn(e) {
    this.output("warn", e);
  },
  error(e) {
    this.output("error", e);
  },
  output(e, t) {
    console?.[e]?.apply?.(console, t);
  }
};
class Ht {
  constructor(t, n = {}) {
    this.init(t, n);
  }
  init(t, n = {}) {
    this.prefix = n.prefix || "i18next:", this.logger = t || js, this.options = n, this.debug = n.debug;
  }
  log(...t) {
    return this.forward(t, "log", "", !0);
  }
  warn(...t) {
    return this.forward(t, "warn", "", !0);
  }
  error(...t) {
    return this.forward(t, "error", "");
  }
  deprecate(...t) {
    return this.forward(t, "warn", "WARNING DEPRECATED: ", !0);
  }
  forward(t, n, r, i) {
    return i && !this.debug ? null : (t = t.map((a) => $(a) ? a.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : a), $(t[0]) && (t[0] = `${r}${this.prefix} ${t[0]}`), this.logger[n](t));
  }
  create(t) {
    return new Ht(this.logger, {
      prefix: `${this.prefix}:${t}:`,
      ...this.options
    });
  }
  clone(t) {
    return t = t || this.options, t.prefix = t.prefix || this.prefix, new Ht(this.logger, t);
  }
}
var Te = new Ht();
class Yt {
  constructor() {
    this.observers = {};
  }
  on(t, n) {
    return t.split(" ").forEach((r) => {
      this.observers[r] || (this.observers[r] = /* @__PURE__ */ new Map());
      const i = this.observers[r].get(n) || 0;
      this.observers[r].set(n, i + 1);
    }), this;
  }
  off(t, n) {
    if (this.observers[t]) {
      if (!n) {
        delete this.observers[t];
        return;
      }
      this.observers[t].delete(n);
    }
  }
  once(t, n) {
    const r = (...i) => {
      n(...i), this.off(t, r);
    };
    return this.on(t, r), this;
  }
  emit(t, ...n) {
    this.observers[t] && Array.from(this.observers[t].entries()).forEach(([i, a]) => {
      for (let s = 0; s < a; s++)
        i(...n);
    }), this.observers["*"] && Array.from(this.observers["*"].entries()).forEach(([i, a]) => {
      for (let s = 0; s < a; s++)
        i(t, ...n);
    });
  }
}
class Lr extends Yt {
  constructor(t, n = {
    ns: ["translation"],
    defaultNS: "translation"
  }) {
    super(), this.data = t || {}, this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.options.ignoreJSONStructure === void 0 && (this.options.ignoreJSONStructure = !0);
  }
  addNamespaces(t) {
    this.options.ns.includes(t) || this.options.ns.push(t);
  }
  removeNamespaces(t) {
    const n = this.options.ns.indexOf(t);
    n > -1 && this.options.ns.splice(n, 1);
  }
  getResource(t, n, r, i = {}) {
    const a = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, s = i.ignoreJSONStructure !== void 0 ? i.ignoreJSONStructure : this.options.ignoreJSONStructure;
    let o;
    t.includes(".") ? o = t.split(".") : (o = [t, n], r && (Array.isArray(r) ? o.push(...r) : $(r) && a ? o.push(...r.split(a)) : o.push(r)));
    const u = Vt(this.data, o);
    return !u && !n && !r && t.includes(".") && (t = o[0], n = o[1], r = o.slice(2).join(".")), u || !s || !$(r) ? u : On(this.data?.[t]?.[n], r, a);
  }
  addResource(t, n, r, i, a = {
    silent: !1
  }) {
    const s = a.keySeparator !== void 0 ? a.keySeparator : this.options.keySeparator;
    let o = [t, n];
    r && (o = o.concat(s ? r.split(s) : r)), t.includes(".") && (o = t.split("."), i = n, n = o[1]), this.addNamespaces(n), Tr(this.data, o, i), a.silent || this.emit("added", t, n, r, i);
  }
  addResources(t, n, r, i = {
    silent: !1
  }) {
    for (const a in r)
      ($(r[a]) || Array.isArray(r[a])) && this.addResource(t, n, a, r[a], {
        silent: !0
      });
    i.silent || this.emit("added", t, n, r);
  }
  addResourceBundle(t, n, r, i, a, s = {
    silent: !1,
    skipCopy: !1
  }) {
    let o = [t, n];
    t.includes(".") && (o = t.split("."), i = r, r = n, n = o[1]), this.addNamespaces(n);
    let u = Vt(this.data, o) || {};
    s.skipCopy || (r = JSON.parse(JSON.stringify(r))), i ? Ki(u, r, a) : u = {
      ...u,
      ...r
    }, Tr(this.data, o, u), s.silent || this.emit("added", t, n, r);
  }
  removeResourceBundle(t, n) {
    this.hasResourceBundle(t, n) && delete this.data[t][n], this.removeNamespaces(n), this.emit("removed", t, n);
  }
  hasResourceBundle(t, n) {
    return this.getResource(t, n) !== void 0;
  }
  getResourceBundle(t, n) {
    return n || (n = this.options.defaultNS), this.getResource(t, n);
  }
  getDataByLanguage(t) {
    return this.data[t];
  }
  hasLanguageSomeTranslations(t) {
    const n = this.getDataByLanguage(t);
    return !!(n && Object.keys(n) || []).find((i) => n[i] && Object.keys(n[i]).length > 0);
  }
  toJSON() {
    return this.data;
  }
}
var Wi = {
  processors: {},
  addPostProcessor(e) {
    this.processors[e.name] = e;
  },
  handle(e, t, n, r, i) {
    return e.forEach((a) => {
      t = this.processors[a]?.process(t, n, r, i) ?? t;
    }), t;
  }
};
const Gi = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
function $s() {
  const e = [], t = /* @__PURE__ */ Object.create(null);
  let n;
  return t.get = (r, i) => (n?.revoke?.(), i === Gi ? e : (e.push(i), n = Proxy.revocable(r, t), n.proxy)), Proxy.revocable(/* @__PURE__ */ Object.create(null), t).proxy;
}
function at(e, t) {
  const {
    [Gi]: n
  } = e($s()), r = t?.keySeparator ?? ".", i = t?.nsSeparator ?? ":", a = t?.enableSelector === "strict";
  if (n.length > 1 && i) {
    const s = t?.ns, o = a ? Array.isArray(s) ? s : s ? [s] : null : Array.isArray(s) ? s : null;
    if (o && (a ? o : o.length > 1 ? o.slice(1) : []).includes(n[0]))
      return `${n[0]}${i}${n.slice(1).join(r)}`;
  }
  return n.join(r);
}
const rn = (e) => !$(e) && typeof e != "boolean" && typeof e != "number";
class Ut extends Yt {
  constructor(t, n = {}) {
    super(), Ls(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], t, this), this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.logger = Te.create("translator"), this.checkedLoadedFor = {};
  }
  changeLanguage(t) {
    t && (this.language = t);
  }
  exists(t, n = {
    interpolation: {}
  }) {
    const r = {
      ...n
    };
    if (t == null) return !1;
    const i = this.resolve(t, r);
    if (i?.res === void 0) return !1;
    const a = rn(i.res);
    return !(r.returnObjects === !1 && a);
  }
  extractFromKey(t, n) {
    let r = n.nsSeparator !== void 0 ? n.nsSeparator : this.options.nsSeparator;
    r === void 0 && (r = ":");
    const i = n.keySeparator !== void 0 ? n.keySeparator : this.options.keySeparator;
    let a = n.ns || this.options.defaultNS || [];
    const s = r && t.includes(r), o = !this.options.userDefinedKeySeparator && !n.keySeparator && !this.options.userDefinedNsSeparator && !n.nsSeparator && !zs(t, r, i);
    if (s && !o) {
      const u = t.match(this.interpolator.nestingRegexp);
      if (u && u.length > 0)
        return {
          key: t,
          namespaces: $(a) ? [a] : a
        };
      const l = t.split(r);
      (r !== i || r === i && this.options.ns.includes(l[0])) && (a = l.shift()), t = l.join(i);
    }
    return {
      key: t,
      namespaces: $(a) ? [a] : a
    };
  }
  translate(t, n, r) {
    let i = typeof n == "object" ? {
      ...n
    } : n;
    if (typeof i != "object" && this.options.overloadTranslationOptionHandler && (i = this.options.overloadTranslationOptionHandler(arguments)), typeof i == "object" && (i = {
      ...i
    }), i || (i = {}), t == null) return "";
    typeof t == "function" && (t = at(t, {
      ...this.options,
      ...i
    })), Array.isArray(t) || (t = [String(t)]), t = t.map((z) => typeof z == "function" ? at(z, {
      ...this.options,
      ...i
    }) : String(z));
    const a = i.returnDetails !== void 0 ? i.returnDetails : this.options.returnDetails, s = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, {
      key: o,
      namespaces: u
    } = this.extractFromKey(t[t.length - 1], i), l = u[u.length - 1];
    let c = i.nsSeparator !== void 0 ? i.nsSeparator : this.options.nsSeparator;
    c === void 0 && (c = ":");
    const f = i.lng || this.language, h = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (f?.toLowerCase() === "cimode")
      return h ? a ? {
        res: `${l}${c}${o}`,
        usedKey: o,
        exactUsedKey: o,
        usedLng: f,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : `${l}${c}${o}` : a ? {
        res: o,
        usedKey: o,
        exactUsedKey: o,
        usedLng: f,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : o;
    const d = this.resolve(t, i);
    let p = d?.res;
    const m = d?.usedKey || o, v = d?.exactUsedKey || o, k = ["[object Number]", "[object Function]", "[object RegExp]"], S = i.joinArrays !== void 0 ? i.joinArrays : this.options.joinArrays, C = !this.i18nFormat || this.i18nFormat.handleAsObject, N = i.count !== void 0 && !$(i.count), A = Ut.hasDefaultValue(i), b = N ? this.pluralResolver.getSuffix(f, i.count, i) : "", I = i.ordinal && N ? this.pluralResolver.getSuffix(f, i.count, {
      ordinal: !1
    }) : "", M = N && !i.ordinal && i.count === 0, F = M && i[`defaultValue${this.options.pluralSeparator}zero`] || i[`defaultValue${b}`] || i[`defaultValue${I}`] || i.defaultValue;
    let w = p;
    C && !p && A && (w = F);
    const R = rn(w), D = Object.prototype.toString.apply(w);
    if (C && w && R && !k.includes(D) && !($(S) && Array.isArray(w))) {
      if (!i.returnObjects && !this.options.returnObjects) {
        this.options.returnedObjectHandler || this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        const z = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(m, w, {
          ...i,
          ns: u
        }) : `key '${o} (${this.language})' returned an object instead of string.`;
        return a ? (d.res = z, d.usedParams = this.getUsedParamsDetails(i), d) : z;
      }
      if (s) {
        const z = Array.isArray(w), _ = z ? [] : {}, O = z ? v : m;
        for (const B in w)
          if (Object.prototype.hasOwnProperty.call(w, B)) {
            const K = `${O}${s}${B}`;
            A && !p ? _[B] = this.translate(K, {
              ...i,
              defaultValue: rn(F) ? F[B] : void 0,
              joinArrays: !1,
              ns: u
            }) : _[B] = this.translate(K, {
              ...i,
              joinArrays: !1,
              ns: u
            }), _[B] === K && (_[B] = w[B]);
          }
        p = _;
      }
    } else if (C && $(S) && Array.isArray(p))
      p = p.join(S), p && (p = this.extendTranslation(p, t, i, r));
    else {
      let z = !1, _ = !1;
      !this.isValidLookup(p) && A && (z = !0, p = F), this.isValidLookup(p) || (_ = !0, p = o);
      const B = (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && _ ? void 0 : p, K = A && F !== p && this.options.updateMissing;
      if (_ || z || K) {
        if (this.logger.log(K ? "updateKey" : "missingKey", f, l, N && !K ? `${o}${this.pluralResolver.getSuffix(f, i.count, i)}` : o, K ? F : p), s) {
          const G = this.resolve(o, {
            ...i,
            keySeparator: !1
          });
          G && G.res && this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let ie = [];
        const se = this.languageUtils.getFallbackCodes(this.options.fallbackLng, i.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && se && se[0])
          for (let G = 0; G < se.length; G++)
            ie.push(se[G]);
        else this.options.saveMissingTo === "all" ? ie = this.languageUtils.toResolveHierarchy(i.lng || this.language) : ie.push(i.lng || this.language);
        const y = (G, oe, x) => {
          const pe = A && x !== p ? x : B;
          this.options.missingKeyHandler ? this.options.missingKeyHandler(G, l, oe, pe, K, i) : this.backendConnector?.saveMissing && this.backendConnector.saveMissing(G, l, oe, pe, K, i), this.emit("missingKey", G, l, oe, p);
        };
        this.options.saveMissing && (this.options.saveMissingPlurals && N ? ie.forEach((G) => {
          const oe = this.pluralResolver.getSuffixes(G, i);
          M && i[`defaultValue${this.options.pluralSeparator}zero`] && !oe.includes(`${this.options.pluralSeparator}zero`) && oe.push(`${this.options.pluralSeparator}zero`), oe.forEach((x) => {
            y([G], o + x, i[`defaultValue${x}`] || F);
          });
        }) : y(ie, o, F));
      }
      p = this.extendTranslation(p, t, i, d, r), _ && p === o && this.options.appendNamespaceToMissingKey && (p = `${l}${c}${o}`), (_ || z) && this.options.parseMissingKeyHandler && (p = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${l}${c}${o}` : o, z ? p : void 0, i));
    }
    return a ? (d.res = p, d.usedParams = this.getUsedParamsDetails(i), d) : p;
  }
  extendTranslation(t, n, r, i, a) {
    if (this.i18nFormat?.parse)
      t = this.i18nFormat.parse(t, {
        ...this.options.interpolation.defaultVariables,
        ...r
      }, r.lng || this.language || i.usedLng, i.usedNS, i.usedKey, {
        resolved: i
      });
    else if (!r.skipInterpolation) {
      r.interpolation && this.interpolator.init({
        ...r,
        interpolation: {
          ...this.options.interpolation,
          ...r.interpolation
        }
      });
      const u = $(t) && (r?.interpolation?.skipOnVariables !== void 0 ? r.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let l;
      if (u) {
        const f = t.match(this.interpolator.nestingRegexp);
        l = f && f.length;
      }
      let c = r.replace && !$(r.replace) ? r.replace : r;
      if (this.options.interpolation.defaultVariables && (c = {
        ...this.options.interpolation.defaultVariables,
        ...c
      }), t = this.interpolator.interpolate(t, c, r.lng || this.language || i.usedLng, r), u) {
        const f = t.match(this.interpolator.nestingRegexp), h = f && f.length;
        l < h && (r.nest = !1);
      }
      !r.lng && i && i.res && (r.lng = this.language || i.usedLng), r.nest !== !1 && (t = this.interpolator.nest(t, (...f) => a?.[0] === f[0] && !r.context ? (this.logger.warn(`It seems you are nesting recursively key: ${f[0]} in key: ${n[0]}`), null) : this.translate(...f, n), r)), r.interpolation && this.interpolator.reset();
    }
    const s = r.postProcess || this.options.postProcess, o = $(s) ? [s] : s;
    return t != null && o?.length && r.applyPostProcessor !== !1 && (t = Wi.handle(o, t, n, this.options && this.options.postProcessPassResolved ? {
      i18nResolved: {
        ...i,
        usedParams: this.getUsedParamsDetails(r)
      },
      ...r
    } : r, this)), t;
  }
  resolve(t, n = {}) {
    let r, i, a, s, o;
    return $(t) && (t = [t]), Array.isArray(t) && (t = t.map((u) => typeof u == "function" ? at(u, {
      ...this.options,
      ...n
    }) : u)), t.forEach((u) => {
      if (this.isValidLookup(r)) return;
      const l = this.extractFromKey(u, n), c = l.key;
      i = c;
      let f = l.namespaces;
      this.options.fallbackNS && (f = f.concat(this.options.fallbackNS));
      const h = n.count !== void 0 && !$(n.count), d = h && !n.ordinal && n.count === 0, p = n.context !== void 0 && ($(n.context) || typeof n.context == "number") && n.context !== "", m = n.lngs ? n.lngs : this.languageUtils.toResolveHierarchy(n.lng || this.language, n.fallbackLng);
      f.forEach((v) => {
        this.isValidLookup(r) || (o = v, !this.checkedLoadedFor[`${m[0]}-${v}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(o) && (this.checkedLoadedFor[`${m[0]}-${v}`] = !0, this.logger.warn(`key "${i}" for languages "${m.join(", ")}" won't get resolved as namespace "${o}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!")), m.forEach((k) => {
          if (this.isValidLookup(r)) return;
          s = k;
          const S = [c];
          if (this.i18nFormat?.addLookupKeys)
            this.i18nFormat.addLookupKeys(S, c, k, v, n);
          else {
            let N;
            h && (N = this.pluralResolver.getSuffix(k, n.count, n));
            const A = `${this.options.pluralSeparator}zero`, b = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (h && (n.ordinal && N.startsWith(b) && S.push(c + N.replace(b, this.options.pluralSeparator)), S.push(c + N), d && S.push(c + A)), p) {
              const I = `${c}${this.options.contextSeparator || "_"}${n.context}`;
              S.push(I), h && (n.ordinal && N.startsWith(b) && S.push(I + N.replace(b, this.options.pluralSeparator)), S.push(I + N), d && S.push(I + A));
            }
          }
          let C;
          for (; C = S.pop(); )
            this.isValidLookup(r) || (a = C, r = this.getResource(k, v, C, n));
        }));
      });
    }), {
      res: r,
      usedKey: i,
      exactUsedKey: a,
      usedLng: s,
      usedNS: o
    };
  }
  isValidLookup(t) {
    return t !== void 0 && !(!this.options.returnNull && t === null) && !(!this.options.returnEmptyString && t === "");
  }
  getResource(t, n, r, i = {}) {
    return this.i18nFormat?.getResource ? this.i18nFormat.getResource(t, n, r, i) : this.resourceStore.getResource(t, n, r, i);
  }
  getUsedParamsDetails(t = {}) {
    const n = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"], r = t.replace && !$(t.replace);
    let i = r ? t.replace : t;
    if (r && typeof t.count < "u" && (i = {
      ...i,
      count: t.count
    }), this.options.interpolation.defaultVariables && (i = {
      ...this.options.interpolation.defaultVariables,
      ...i
    }), !r) {
      i = {
        ...i
      };
      for (const a of n)
        delete i[a];
    }
    return i;
  }
  static hasDefaultValue(t) {
    const n = "defaultValue";
    for (const r in t)
      if (Object.prototype.hasOwnProperty.call(t, r) && r.startsWith(n) && t[r] !== void 0)
        return !0;
    return !1;
  }
}
class Ar {
  constructor(t) {
    this.options = t, this.supportedLngs = this.options.supportedLngs || !1, this.logger = Te.create("languageUtils");
  }
  getScriptPartFromCode(t) {
    if (t = Et(t), !t || !t.includes("-")) return null;
    const n = t.split("-");
    return n.length === 2 || (n.pop(), n[n.length - 1].toLowerCase() === "x") ? null : this.formatLanguageCode(n.join("-"));
  }
  getLanguagePartFromCode(t) {
    if (t = Et(t), !t || !t.includes("-")) return t;
    const n = t.split("-");
    return this.formatLanguageCode(n[0]);
  }
  formatLanguageCode(t) {
    if ($(t) && t.includes("-")) {
      let n;
      try {
        n = Intl.getCanonicalLocales(t)[0];
      } catch {
      }
      return n && this.options.lowerCaseLng && (n = n.toLowerCase()), n || (this.options.lowerCaseLng ? t.toLowerCase() : t);
    }
    return this.options.cleanCode || this.options.lowerCaseLng ? t.toLowerCase() : t;
  }
  isSupportedCode(t) {
    return (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) && (t = this.getLanguagePartFromCode(t)), !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(t);
  }
  getBestMatchFromCodes(t) {
    if (!t) return null;
    let n;
    return t.forEach((r) => {
      if (n) return;
      const i = this.formatLanguageCode(r);
      (!this.options.supportedLngs || this.isSupportedCode(i)) && (n = i);
    }), !n && this.options.supportedLngs && t.forEach((r) => {
      if (n) return;
      const i = this.getScriptPartFromCode(r);
      if (this.isSupportedCode(i)) return n = i;
      const a = this.getLanguagePartFromCode(r);
      if (this.isSupportedCode(a)) return n = a;
      n = this.options.supportedLngs.find((s) => s === a ? !0 : !s.includes("-") && !a.includes("-") ? !1 : !!(s.includes("-") && !a.includes("-") && s.slice(0, s.indexOf("-")) === a || s.startsWith(a) && a.length > 1));
    }), n || (n = this.getFallbackCodes(this.options.fallbackLng)[0]), n;
  }
  getFallbackCodes(t, n) {
    if (!t) return [];
    if (typeof t == "function" && (t = t(n)), $(t) && (t = [t]), Array.isArray(t)) return t;
    if (!n) return t.default || [];
    let r = t[n];
    return r || (r = t[this.getScriptPartFromCode(n)]), r || (r = t[this.formatLanguageCode(n)]), r || (r = t[this.getLanguagePartFromCode(n)]), r || (r = t.default), r || [];
  }
  toResolveHierarchy(t, n) {
    const r = this.getFallbackCodes((n === !1 ? [] : n) || this.options.fallbackLng || [], t), i = [], a = (s) => {
      s && (this.isSupportedCode(s) ? i.push(s) : this.logger.warn(`rejecting language code not found in supportedLngs: ${s}`));
    };
    return $(t) && (t.includes("-") || t.includes("_")) ? (this.options.load !== "languageOnly" && a(this.formatLanguageCode(t)), this.options.load !== "languageOnly" && this.options.load !== "currentOnly" && a(this.getScriptPartFromCode(t)), this.options.load !== "currentOnly" && a(this.getLanguagePartFromCode(t))) : $(t) && a(this.formatLanguageCode(t)), r.forEach((s) => {
      i.includes(s) || a(this.formatLanguageCode(s));
    }), i;
  }
}
const Rr = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
}, Or = {
  select: (e) => e === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
class Bs {
  constructor(t, n = {}) {
    this.languageUtils = t, this.options = n, this.logger = Te.create("pluralResolver"), this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(t, n = {}) {
    const r = Et(t === "dev" ? "en" : t), i = n.ordinal ? "ordinal" : "cardinal", a = JSON.stringify({
      cleanedCode: r,
      type: i
    });
    if (a in this.pluralRulesCache)
      return this.pluralRulesCache[a];
    let s;
    try {
      s = new Intl.PluralRules(r, {
        type: i
      });
    } catch {
      if (typeof Intl > "u")
        return this.logger.error("No Intl support, please use an Intl polyfill!"), Or;
      if (!t.match(/-|_/)) return Or;
      const u = this.languageUtils.getLanguagePartFromCode(t);
      s = this.getRule(u, n);
    }
    return this.pluralRulesCache[a] = s, s;
  }
  needsPlural(t, n = {}) {
    let r = this.getRule(t, n);
    return r || (r = this.getRule("dev", n)), r?.resolvedOptions().pluralCategories.length > 1;
  }
  getPluralFormsOfKey(t, n, r = {}) {
    return this.getSuffixes(t, r).map((i) => `${n}${i}`);
  }
  getSuffixes(t, n = {}) {
    let r = this.getRule(t, n);
    return r || (r = this.getRule("dev", n)), r ? r.resolvedOptions().pluralCategories.sort((i, a) => Rr[i] - Rr[a]).map((i) => `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ""}${i}`) : [];
  }
  getSuffix(t, n, r = {}) {
    const i = this.getRule(t, r);
    return i ? `${this.options.prepend}${r.ordinal ? `ordinal${this.options.prepend}` : ""}${i.select(n)}` : (this.logger.warn(`no plural rule found for: ${t}`), this.getSuffix("dev", n, r));
  }
}
const Pr = (e, t, n, r = ".", i = !0) => {
  let a = Os(e, t, n);
  return !a && i && $(n) && (a = On(e, n, r), a === void 0 && (a = On(t, n, r))), a;
}, Vs = (e) => e.replace(/\$/g, "$$$$");
class Dr {
  constructor(t = {}) {
    this.logger = Te.create("interpolator"), this.options = t, this.format = t?.interpolation?.format || ((n) => n), this.init(t);
  }
  init(t = {}) {
    t.interpolation || (t.interpolation = {
      escapeValue: !0
    });
    const {
      escape: n,
      escapeValue: r,
      useRawValueToEscape: i,
      prefix: a,
      prefixEscaped: s,
      suffix: o,
      suffixEscaped: u,
      formatSeparator: l,
      unescapeSuffix: c,
      unescapePrefix: f,
      nestingPrefix: h,
      nestingPrefixEscaped: d,
      nestingSuffix: p,
      nestingSuffixEscaped: m,
      nestingOptionsSeparator: v,
      maxReplaces: k,
      alwaysFormat: S
    } = t.interpolation;
    this.escape = n !== void 0 ? n : Ds, this.escapeValue = r !== void 0 ? r : !0, this.useRawValueToEscape = i !== void 0 ? i : !1, this.prefix = a ? Pe(a) : s || "{{", this.suffix = o ? Pe(o) : u || "}}", this.formatSeparator = l || ",", this.unescapePrefix = c ? "" : f ? Pe(f) : "-", this.unescapeSuffix = this.unescapePrefix ? "" : c ? Pe(c) : "", this.nestingPrefix = h ? Pe(h) : d || Pe("$t("), this.nestingSuffix = p ? Pe(p) : m || Pe(")"), this.nestingOptionsSeparator = v || ",", this.maxReplaces = k || 1e3, this.alwaysFormat = S !== void 0 ? S : !1, this.resetRegExp();
  }
  reset() {
    this.options && this.init(this.options);
  }
  resetRegExp() {
    const t = (n, r) => n?.source === r ? (n.lastIndex = 0, n) : new RegExp(r, "g");
    this.regexp = t(this.regexp, `${this.prefix}(.+?)${this.suffix}`), this.regexpUnescape = t(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`), this.nestingRegexp = t(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
  }
  interpolate(t, n, r, i) {
    let a, s, o;
    const u = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {}, l = (d) => {
      if (!d.includes(this.formatSeparator)) {
        const k = Pr(n, u, d, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(k, void 0, r, {
          ...i,
          ...n,
          interpolationkey: d
        }) : k;
      }
      const p = d.split(this.formatSeparator), m = p.shift().trim(), v = p.join(this.formatSeparator).trim();
      return this.format(Pr(n, u, m, this.options.keySeparator, this.options.ignoreJSONStructure), v, r, {
        ...i,
        ...n,
        interpolationkey: m
      });
    };
    this.resetRegExp(), !this.escapeValue && typeof t == "string" && /\$t\([^)]*\{[^}]*\{\{/.test(t) && this.logger.warn("nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.");
    const c = i?.missingInterpolationHandler || this.options.missingInterpolationHandler, f = i?.interpolation?.skipOnVariables !== void 0 ? i.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    return [{
      regex: this.regexpUnescape,
      safeValue: (d) => d
    }, {
      regex: this.regexp,
      safeValue: (d) => this.escapeValue ? this.escape(d) : d
    }].forEach((d) => {
      for (o = 0; a = d.regex.exec(t); ) {
        const p = a[1].trim();
        if (s = l(p), s === void 0)
          if (typeof c == "function") {
            const v = c(t, a, i);
            s = $(v) ? v : "";
          } else if (i && Object.prototype.hasOwnProperty.call(i, p))
            s = "";
          else if (f) {
            s = a[0];
            continue;
          } else
            this.logger.warn(`missed to pass in variable ${p} for interpolating ${t}`), s = "";
        else !$(s) && !this.useRawValueToEscape && (s = Er(s));
        const m = d.safeValue(s);
        if (t = t.replace(a[0], Vs(m)), f ? (d.regex.lastIndex += m.length, d.regex.lastIndex -= a[0].length) : d.regex.lastIndex = 0, o++, o >= this.maxReplaces)
          break;
      }
    }), t;
  }
  nest(t, n, r = {}) {
    let i, a, s;
    const o = (u, l) => {
      const c = this.nestingOptionsSeparator;
      if (!u.includes(c)) return u;
      const f = u.split(new RegExp(`${Pe(c)}[ ]*{`));
      let h = `{${f[1]}`;
      u = f[0], h = this.interpolate(h, s);
      const d = h.match(/'/g), p = h.match(/"/g);
      ((d?.length ?? 0) % 2 === 0 && !p || (p?.length ?? 0) % 2 !== 0) && (h = h.replace(/'/g, '"'));
      try {
        s = JSON.parse(h), l && (s = {
          ...l,
          ...s
        });
      } catch (m) {
        return this.logger.warn(`failed parsing options string in nesting for key ${u}`, m), `${u}${c}${h}`;
      }
      return s.defaultValue && s.defaultValue.includes(this.prefix) && delete s.defaultValue, u;
    };
    for (; i = this.nestingRegexp.exec(t); ) {
      let u = [];
      s = {
        ...r
      }, s = s.replace && !$(s.replace) ? s.replace : s, s.applyPostProcessor = !1, delete s.defaultValue;
      const l = /{.*}/s.test(i[1]) ? i[1].lastIndexOf("}") + 1 : i[1].indexOf(this.formatSeparator);
      if (l !== -1 && (u = i[1].slice(l).split(this.formatSeparator).map((c) => c.trim()).filter(Boolean), i[1] = i[1].slice(0, l)), a = n(o.call(this, i[1].trim(), s), s), a && i[0] === t && !$(a)) return a;
      $(a) || (a = Er(a)), a || (this.logger.warn(`missed to resolve ${i[1]} for nesting ${t}`), a = ""), u.length && (a = u.reduce((c, f) => this.format(c, f, r.lng, {
        ...r,
        interpolationkey: i[1].trim()
      }), a.trim())), t = t.replace(i[0], a), this.regexp.lastIndex = 0;
    }
    return t;
  }
}
const Hs = (e) => {
  let t = e.toLowerCase().trim();
  const n = {};
  if (e.includes("(")) {
    const r = e.split("(");
    t = r[0].toLowerCase().trim();
    const i = r[1].slice(0, -1);
    t === "currency" && !i.includes(":") ? n.currency || (n.currency = i.trim()) : t === "relativetime" && !i.includes(":") ? n.range || (n.range = i.trim()) : i.split(";").forEach((s) => {
      if (s) {
        const [o, ...u] = s.split(":"), l = u.join(":").trim().replace(/^'+|'+$/g, ""), c = o.trim();
        n[c] || (n[c] = l), l === "false" && (n[c] = !1), l === "true" && (n[c] = !0), isNaN(l) || (n[c] = parseInt(l, 10));
      }
    });
  }
  return {
    formatName: t,
    formatOptions: n
  };
}, _r = (e) => {
  const t = {};
  return (n, r, i) => {
    let a = i;
    i && i.interpolationkey && i.formatParams && i.formatParams[i.interpolationkey] && i[i.interpolationkey] && (a = {
      ...a,
      [i.interpolationkey]: void 0
    });
    const s = r + JSON.stringify(a);
    let o = t[s];
    return o || (o = e(Et(r), i), t[s] = o), o(n);
  };
}, Us = (e) => (t, n, r) => e(Et(n), r)(t);
class qs {
  constructor(t = {}) {
    this.logger = Te.create("formatter"), this.options = t, this.init(t);
  }
  init(t, n = {
    interpolation: {}
  }) {
    this.formatSeparator = n.interpolation.formatSeparator || ",";
    const r = n.cacheInBuiltFormats ? _r : Us;
    this.formats = {
      number: r((i, a) => {
        const s = new Intl.NumberFormat(i, {
          ...a
        });
        return (o) => s.format(o);
      }),
      currency: r((i, a) => {
        const s = new Intl.NumberFormat(i, {
          ...a,
          style: "currency"
        });
        return (o) => s.format(o);
      }),
      datetime: r((i, a) => {
        const s = new Intl.DateTimeFormat(i, {
          ...a
        });
        return (o) => s.format(o);
      }),
      relativetime: r((i, a) => {
        const s = new Intl.RelativeTimeFormat(i, {
          ...a
        });
        return (o) => s.format(o, a.range || "day");
      }),
      list: r((i, a) => {
        const s = new Intl.ListFormat(i, {
          ...a
        });
        return (o) => s.format(o);
      })
    };
  }
  add(t, n) {
    this.formats[t.toLowerCase().trim()] = n;
  }
  addCached(t, n) {
    this.formats[t.toLowerCase().trim()] = _r(n);
  }
  format(t, n, r, i = {}) {
    if (!n || t == null) return t;
    const a = n.split(this.formatSeparator), s = [];
    for (let u = 0; u < a.length; u++) {
      let l = a[u];
      for (; l.indexOf("(") > -1 && !l.includes(")") && u + 1 < a.length; )
        l = `${l}${this.formatSeparator}${a[++u]}`;
      s.push(l);
    }
    return s.reduce((u, l) => {
      const {
        formatName: c,
        formatOptions: f
      } = Hs(l);
      if (this.formats[c]) {
        let h = u;
        try {
          const d = i?.formatParams?.[i.interpolationkey] || {}, p = d.locale || d.lng || i.locale || i.lng || r;
          h = this.formats[c](u, p, {
            ...f,
            ...i,
            ...d
          });
        } catch (d) {
          this.logger.warn(d);
        }
        return h;
      } else
        this.logger.warn(`there was no format function for ${c}`);
      return u;
    }, t);
  }
}
const Ks = (e, t) => {
  e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--);
};
class Ws extends Yt {
  constructor(t, n, r, i = {}) {
    super(), this.backend = t, this.store = n, this.services = r, this.languageUtils = r.languageUtils, this.options = i, this.logger = Te.create("backendConnector"), this.waitingReads = [], this.maxParallelReads = i.maxParallelReads || 10, this.readingCalls = 0, this.maxRetries = i.maxRetries >= 0 ? i.maxRetries : 5, this.retryTimeout = i.retryTimeout >= 1 ? i.retryTimeout : 350, this.state = {}, this.queue = [], this.backend?.init?.(r, i.backend, i);
  }
  queueLoad(t, n, r, i) {
    const a = {}, s = {}, o = {}, u = {};
    return t.forEach((l) => {
      let c = !0;
      n.forEach((f) => {
        const h = `${l}|${f}`;
        !r.reload && this.store.hasResourceBundle(l, f) ? this.state[h] = 2 : this.state[h] < 0 || (this.state[h] === 1 ? s[h] === void 0 && (s[h] = !0) : (this.state[h] = 1, c = !1, s[h] === void 0 && (s[h] = !0), a[h] === void 0 && (a[h] = !0), u[f] === void 0 && (u[f] = !0)));
      }), c || (o[l] = !0);
    }), (Object.keys(a).length || Object.keys(s).length) && this.queue.push({
      pending: s,
      pendingCount: Object.keys(s).length,
      loaded: {},
      errors: [],
      callback: i
    }), {
      toLoad: Object.keys(a),
      pending: Object.keys(s),
      toLoadLanguages: Object.keys(o),
      toLoadNamespaces: Object.keys(u)
    };
  }
  loaded(t, n, r) {
    const i = t.split("|"), a = i[0], s = i[1];
    n && this.emit("failedLoading", a, s, n), !n && r && this.store.addResourceBundle(a, s, r, void 0, void 0, {
      skipCopy: !0
    }), this.state[t] = n ? -1 : 2, n && r && (this.state[t] = 0);
    const o = {};
    this.queue.forEach((u) => {
      Rs(u.loaded, [a], s), Ks(u, t), n && u.errors.push(n), u.pendingCount === 0 && !u.done && (Object.keys(u.loaded).forEach((l) => {
        o[l] || (o[l] = {});
        const c = u.loaded[l];
        c.length && c.forEach((f) => {
          o[l][f] === void 0 && (o[l][f] = !0);
        });
      }), u.done = !0, u.errors.length ? u.callback(u.errors) : u.callback());
    }), this.emit("loaded", o), this.queue = this.queue.filter((u) => !u.done);
  }
  read(t, n, r, i = 0, a = this.retryTimeout, s) {
    if (!t.length) return s(null, {});
    if (this.readingCalls >= this.maxParallelReads) {
      this.waitingReads.push({
        lng: t,
        ns: n,
        fcName: r,
        tried: i,
        wait: a,
        callback: s
      });
      return;
    }
    this.readingCalls++;
    const o = (l, c) => {
      if (this.readingCalls--, this.waitingReads.length > 0) {
        const f = this.waitingReads.shift();
        this.read(f.lng, f.ns, f.fcName, f.tried, f.wait, f.callback);
      }
      if (l && c && i < this.maxRetries) {
        setTimeout(() => {
          this.read(t, n, r, i + 1, a * 2, s);
        }, a);
        return;
      }
      s(l, c);
    }, u = this.backend[r].bind(this.backend);
    if (u.length === 2) {
      try {
        const l = u(t, n);
        l && typeof l.then == "function" ? l.then((c) => o(null, c)).catch(o) : o(null, l);
      } catch (l) {
        o(l);
      }
      return;
    }
    return u(t, n, o);
  }
  prepareLoading(t, n, r = {}, i) {
    if (!this.backend)
      return this.logger.warn("No backend was added via i18next.use. Will not load resources."), i && i();
    $(t) && (t = this.languageUtils.toResolveHierarchy(t)), $(n) && (n = [n]);
    const a = this.queueLoad(t, n, r, i);
    if (!a.toLoad.length)
      return a.pending.length || i(), null;
    a.toLoad.forEach((s) => {
      this.loadOne(s);
    });
  }
  load(t, n, r) {
    this.prepareLoading(t, n, {}, r);
  }
  reload(t, n, r) {
    this.prepareLoading(t, n, {
      reload: !0
    }, r);
  }
  loadOne(t, n = "") {
    const r = t.split("|"), i = r[0], a = r[1];
    this.read(i, a, "read", void 0, void 0, (s, o) => {
      s && this.logger.warn(`${n}loading namespace ${a} for language ${i} failed`, s), !s && o && this.logger.log(`${n}loaded namespace ${a} for language ${i}`, o), this.loaded(t, s, o);
    });
  }
  saveMissing(t, n, r, i, a, s = {}, o = () => {
  }) {
    if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(n)) {
      this.logger.warn(`did not save key "${r}" as the namespace "${n}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
      return;
    }
    if (!(r == null || r === "")) {
      if (this.backend?.create) {
        const u = {
          ...s,
          isUpdate: a
        }, l = this.backend.create.bind(this.backend);
        if (l.length < 6)
          try {
            let c;
            l.length === 5 ? c = l(t, n, r, i, u) : c = l(t, n, r, i), c && typeof c.then == "function" ? c.then((f) => o(null, f)).catch(o) : o(null, c);
          } catch (c) {
            o(c);
          }
        else
          l(t, n, r, i, o, u);
      }
      !t || !t[0] || this.store.addResource(t[0], n, r, i);
    }
  }
}
const an = () => ({
  debug: !1,
  initAsync: !0,
  ns: ["translation"],
  defaultNS: ["translation"],
  fallbackLng: ["dev"],
  fallbackNS: !1,
  supportedLngs: !1,
  nonExplicitSupportedLngs: !1,
  load: "all",
  preload: !1,
  keySeparator: ".",
  nsSeparator: ":",
  pluralSeparator: "_",
  contextSeparator: "_",
  enableSelector: !1,
  partialBundledLanguages: !1,
  saveMissing: !1,
  updateMissing: !1,
  saveMissingTo: "fallback",
  saveMissingPlurals: !0,
  missingKeyHandler: !1,
  missingInterpolationHandler: !1,
  postProcess: !1,
  postProcessPassResolved: !1,
  returnNull: !1,
  returnEmptyString: !0,
  returnObjects: !1,
  joinArrays: !1,
  returnedObjectHandler: !1,
  parseMissingKeyHandler: !1,
  appendNamespaceToMissingKey: !1,
  appendNamespaceToCIMode: !1,
  overloadTranslationOptionHandler: (e) => {
    let t = {};
    if (typeof e[1] == "object" && (t = e[1]), $(e[1]) && (t.defaultValue = e[1]), $(e[2]) && (t.tDescription = e[2]), typeof e[2] == "object" || typeof e[3] == "object") {
      const n = e[3] || e[2];
      Object.keys(n).forEach((r) => {
        t[r] = n[r];
      });
    }
    return t;
  },
  interpolation: {
    escapeValue: !0,
    prefix: "{{",
    suffix: "}}",
    formatSeparator: ",",
    unescapePrefix: "-",
    nestingPrefix: "$t(",
    nestingSuffix: ")",
    nestingOptionsSeparator: ",",
    maxReplaces: 1e3,
    skipOnVariables: !0
  },
  cacheInBuiltFormats: !0
}), Fr = (e) => ($(e.ns) && (e.ns = [e.ns]), $(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]), $(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]), e.supportedLngs && !e.supportedLngs.includes("cimode") && (e.supportedLngs = e.supportedLngs.concat(["cimode"])), e), Ot = () => {
}, Gs = (e) => {
  Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((n) => {
    typeof e[n] == "function" && (e[n] = e[n].bind(e));
  });
};
class vt extends Yt {
  constructor(t = {}, n) {
    if (super(), this.options = Fr(t), this.services = {}, this.logger = Te, this.modules = {
      external: []
    }, Gs(this), n && !this.isInitialized && !t.isClone) {
      if (!this.options.initAsync)
        return this.init(t, n), this;
      setTimeout(() => {
        this.init(t, n);
      }, 0);
    }
  }
  init(t = {}, n) {
    this.isInitializing = !0, typeof t == "function" && (n = t, t = {}), t.defaultNS == null && t.ns && ($(t.ns) ? t.defaultNS = t.ns : t.ns.includes("translation") || (t.defaultNS = t.ns[0]));
    const r = an();
    this.options = {
      ...r,
      ...this.options,
      ...Fr(t)
    }, this.options.interpolation = {
      ...r.interpolation,
      ...this.options.interpolation
    }, t.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = t.keySeparator), t.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = t.nsSeparator), typeof this.options.overloadTranslationOptionHandler != "function" && (this.options.overloadTranslationOptionHandler = r.overloadTranslationOptionHandler);
    const i = (l) => l ? typeof l == "function" ? new l() : l : null;
    if (!this.options.isClone) {
      this.modules.logger ? Te.init(i(this.modules.logger), this.options) : Te.init(null, this.options);
      let l;
      this.modules.formatter ? l = this.modules.formatter : l = qs;
      const c = new Ar(this.options);
      this.store = new Lr(this.options.resources, this.options);
      const f = this.services;
      f.logger = Te, f.resourceStore = this.store, f.languageUtils = c, f.pluralResolver = new Bs(c, {
        prepend: this.options.pluralSeparator
      }), l && (f.formatter = i(l), f.formatter.init && f.formatter.init(f, this.options), this.options.interpolation.format = f.formatter.format.bind(f.formatter)), f.interpolator = new Dr(this.options), f.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      }, f.backendConnector = new Ws(i(this.modules.backend), f.resourceStore, f, this.options), f.backendConnector.on("*", (h, ...d) => {
        this.emit(h, ...d);
      }), this.modules.languageDetector && (f.languageDetector = i(this.modules.languageDetector), f.languageDetector.init && f.languageDetector.init(f, this.options.detection, this.options)), this.modules.i18nFormat && (f.i18nFormat = i(this.modules.i18nFormat), f.i18nFormat.init && f.i18nFormat.init(this)), this.translator = new Ut(this.services, this.options), this.translator.on("*", (h, ...d) => {
        this.emit(h, ...d);
      }), this.modules.external.forEach((h) => {
        h.init && h.init(this);
      });
    }
    if (this.format = this.options.interpolation.format, n || (n = Ot), this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const l = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      l.length > 0 && l[0] !== "dev" && (this.options.lng = l[0]);
    }
    !this.services.languageDetector && !this.options.lng && this.logger.warn("init: no languageDetector is used and no lng is defined"), ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"].forEach((l) => {
      this[l] = (...c) => this.store[l](...c);
    }), ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"].forEach((l) => {
      this[l] = (...c) => (this.store[l](...c), this);
    });
    const o = dt(), u = () => {
      const l = (c, f) => {
        this.isInitializing = !1, this.isInitialized && !this.initializedStoreOnce && this.logger.warn("init: i18next is already initialized. You should call init just once!"), this.isInitialized = !0, this.options.isClone || this.logger.log("initialized", this.options), this.emit("initialized", this.options), o.resolve(f), n(c, f);
      };
      if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return l(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, l);
    };
    return this.options.resources || !this.options.initAsync ? u() : setTimeout(u, 0), o;
  }
  loadResources(t, n = Ot) {
    let r = n;
    const i = $(t) ? t : this.language;
    if (typeof t == "function" && (r = t), !this.options.resources || this.options.partialBundledLanguages) {
      if (i?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return r();
      const a = [], s = (o) => {
        if (!o || o === "cimode") return;
        this.services.languageUtils.toResolveHierarchy(o).forEach((l) => {
          l !== "cimode" && (a.includes(l) || a.push(l));
        });
      };
      i ? s(i) : this.services.languageUtils.getFallbackCodes(this.options.fallbackLng).forEach((u) => s(u)), this.options.preload?.forEach?.((o) => s(o)), this.services.backendConnector.load(a, this.options.ns, (o) => {
        !o && !this.resolvedLanguage && this.language && this.setResolvedLanguage(this.language), r(o);
      });
    } else
      r(null);
  }
  reloadResources(t, n, r) {
    const i = dt();
    return typeof t == "function" && (r = t, t = void 0), typeof n == "function" && (r = n, n = void 0), t || (t = this.languages), n || (n = this.options.ns), r || (r = Ot), this.services.backendConnector.reload(t, n, (a) => {
      i.resolve(), r(a);
    }), i;
  }
  use(t) {
    if (!t) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!t.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    return t.type === "backend" && (this.modules.backend = t), (t.type === "logger" || t.log && t.warn && t.error) && (this.modules.logger = t), t.type === "languageDetector" && (this.modules.languageDetector = t), t.type === "i18nFormat" && (this.modules.i18nFormat = t), t.type === "postProcessor" && Wi.addPostProcessor(t), t.type === "formatter" && (this.modules.formatter = t), t.type === "3rdParty" && this.modules.external.push(t), this;
  }
  setResolvedLanguage(t) {
    if (!(!t || !this.languages) && !["cimode", "dev"].includes(t)) {
      for (let n = 0; n < this.languages.length; n++) {
        const r = this.languages[n];
        if (!["cimode", "dev"].includes(r) && this.store.hasLanguageSomeTranslations(r)) {
          this.resolvedLanguage = r;
          break;
        }
      }
      !this.resolvedLanguage && !this.languages.includes(t) && this.store.hasLanguageSomeTranslations(t) && (this.resolvedLanguage = t, this.languages.unshift(t));
    }
  }
  changeLanguage(t, n) {
    this.isLanguageChangingTo = t;
    const r = dt();
    this.emit("languageChanging", t);
    const i = (o) => {
      this.language = o, this.languages = this.services.languageUtils.toResolveHierarchy(o), this.resolvedLanguage = void 0, this.setResolvedLanguage(o);
    }, a = (o, u) => {
      u ? this.isLanguageChangingTo === t && (i(u), this.translator.changeLanguage(u), this.isLanguageChangingTo = void 0, this.emit("languageChanged", u), this.logger.log("languageChanged", u)) : this.isLanguageChangingTo = void 0, r.resolve((...l) => this.t(...l)), n && n(o, (...l) => this.t(...l));
    }, s = (o) => {
      !t && !o && this.services.languageDetector && (o = []);
      const u = $(o) ? o : o && o[0], l = this.store.hasLanguageSomeTranslations(u) ? u : this.services.languageUtils.getBestMatchFromCodes($(o) ? [o] : o);
      l && (this.language || i(l), this.translator.language || this.translator.changeLanguage(l), this.services.languageDetector?.cacheUserLanguage?.(l)), this.loadResources(l, (c) => {
        a(c, l);
      });
    };
    return !t && this.services.languageDetector && !this.services.languageDetector.async ? s(this.services.languageDetector.detect()) : !t && this.services.languageDetector && this.services.languageDetector.async ? this.services.languageDetector.detect.length === 0 ? this.services.languageDetector.detect().then(s) : this.services.languageDetector.detect(s) : s(t), r;
  }
  getFixedT(t, n, r, i) {
    const a = i?.scopeNs, s = (o, u, ...l) => {
      let c;
      typeof u != "object" ? c = this.options.overloadTranslationOptionHandler([o, u].concat(l)) : c = {
        ...u
      }, c.lng = c.lng || s.lng, c.lngs = c.lngs || s.lngs;
      const f = c.ns !== void 0 && c.ns !== null;
      c.ns = c.ns || s.ns, c.keyPrefix !== "" && (c.keyPrefix = c.keyPrefix || r || s.keyPrefix);
      const h = {
        ...this.options,
        ...c
      };
      Array.isArray(a) && !f && (h.ns = a), typeof c.keyPrefix == "function" && (c.keyPrefix = at(c.keyPrefix, h));
      const d = this.options.keySeparator || ".";
      let p;
      return c.keyPrefix && Array.isArray(o) ? p = o.map((m) => (typeof m == "function" && (m = at(m, h)), `${c.keyPrefix}${d}${m}`)) : (typeof o == "function" && (o = at(o, h)), p = c.keyPrefix ? `${c.keyPrefix}${d}${o}` : o), this.t(p, c);
    };
    return $(t) ? s.lng = t : s.lngs = t, s.ns = n, s.keyPrefix = r, s;
  }
  t(...t) {
    return this.translator?.translate(...t);
  }
  exists(...t) {
    return this.translator?.exists(...t);
  }
  setDefaultNamespace(t) {
    this.options.defaultNS = t;
  }
  hasLoadedNamespace(t, n = {}) {
    if (!this.isInitialized)
      return this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages), !1;
    if (!this.languages || !this.languages.length)
      return this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages), !1;
    const r = n.lng || this.resolvedLanguage || this.languages[0], i = this.options ? this.options.fallbackLng : !1, a = this.languages[this.languages.length - 1];
    if (r.toLowerCase() === "cimode") return !0;
    const s = (o, u) => {
      const l = this.services.backendConnector.state[`${o}|${u}`];
      return l === -1 || l === 0 || l === 2;
    };
    if (n.precheck) {
      const o = n.precheck(this, s);
      if (o !== void 0) return o;
    }
    return !!(this.hasResourceBundle(r, t) || !this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages || s(r, t) && (!i || s(a, t)));
  }
  loadNamespaces(t, n) {
    const r = dt();
    return this.options.ns ? ($(t) && (t = [t]), t.forEach((i) => {
      this.options.ns.includes(i) || this.options.ns.push(i);
    }), this.loadResources((i) => {
      r.resolve(), n && n(i);
    }), r) : (n && n(), Promise.resolve());
  }
  loadLanguages(t, n) {
    const r = dt();
    $(t) && (t = [t]);
    const i = this.options.preload || [], a = t.filter((s) => !i.includes(s) && this.services.languageUtils.isSupportedCode(s));
    return a.length ? (this.options.preload = i.concat(a), this.loadResources((s) => {
      r.resolve(), n && n(s);
    }), r) : (n && n(), Promise.resolve());
  }
  dir(t) {
    if (t || (t = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language)), !t) return "rtl";
    try {
      const i = new Intl.Locale(t);
      if (i && i.getTextInfo) {
        const a = i.getTextInfo();
        if (a && a.direction) return a.direction;
      }
    } catch {
    }
    const n = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"], r = this.services?.languageUtils || new Ar(an());
    return t.toLowerCase().indexOf("-latn") > 1 ? "ltr" : n.includes(r.getLanguagePartFromCode(t)) || t.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(t = {}, n) {
    const r = new vt(t, n);
    return r.createInstance = vt.createInstance, r;
  }
  cloneInstance(t = {}, n = Ot) {
    const r = t.forkResourceStore;
    r && delete t.forkResourceStore;
    const i = {
      ...this.options,
      ...t,
      isClone: !0
    }, a = new vt(i);
    if ((t.debug !== void 0 || t.prefix !== void 0) && (a.logger = a.logger.clone(t)), ["store", "services", "language"].forEach((o) => {
      a[o] = this[o];
    }), a.services = {
      ...this.services
    }, a.services.utils = {
      hasLoadedNamespace: a.hasLoadedNamespace.bind(a)
    }, r) {
      const o = Object.keys(this.store.data).reduce((u, l) => (u[l] = {
        ...this.store.data[l]
      }, u[l] = Object.keys(u[l]).reduce((c, f) => (c[f] = {
        ...u[l][f]
      }, c), u[l]), u), {});
      a.store = new Lr(o, i), a.services.resourceStore = a.store;
    }
    if (t.interpolation) {
      const u = {
        ...an().interpolation,
        ...this.options.interpolation,
        ...t.interpolation
      }, l = {
        ...i,
        interpolation: u
      };
      a.services.interpolator = new Dr(l);
    }
    return a.translator = new Ut(a.services, i), a.translator.on("*", (o, ...u) => {
      a.emit(o, ...u);
    }), a.init(i, n), a.translator.options = i, a.translator.backendConnector.services.utils = {
      hasLoadedNamespace: a.hasLoadedNamespace.bind(a)
    }, a;
  }
  toJSON() {
    return {
      options: this.options,
      store: this.store,
      language: this.language,
      languages: this.languages,
      resolvedLanguage: this.resolvedLanguage
    };
  }
}
const he = vt.createInstance();
he.createInstance;
he.dir;
he.init;
he.loadResources;
he.reloadResources;
he.use;
he.changeLanguage;
he.getFixedT;
he.t;
he.exists;
he.setDefaultNamespace;
he.hasLoadedNamespace;
he.loadNamespaces;
he.loadLanguages;
function Ji(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
const Js = (e, t, n, r) => {
  const i = [n, {
    code: t,
    ...r || {}
  }];
  if (e?.services?.logger?.forward)
    return e.services.logger.forward(i, "warn", "react-i18next::", !0);
  We(i[0]) && (i[0] = `react-i18next:: ${i[0]}`), e?.services?.logger?.warn ? e.services.logger.warn(...i) : console?.warn && console.warn(...i);
}, Mr = {}, jt = (e, t, n, r) => {
  We(n) && Mr[n] || (We(n) && (Mr[n] = /* @__PURE__ */ new Date()), Js(e, t, n, r));
}, Yi = (e, t) => () => {
  if (e.isInitialized)
    t();
  else {
    const n = () => {
      setTimeout(() => {
        e.off("initialized", n);
      }, 0), t();
    };
    e.on("initialized", n);
  }
}, Pn = (e, t, n) => {
  e.loadNamespaces(t, Yi(e, n));
}, zr = (e, t, n, r) => {
  if (We(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1) return Pn(e, n, r);
  n.forEach((i) => {
    e.options.ns.indexOf(i) < 0 && e.options.ns.push(i);
  }), e.loadLanguages(t, Yi(e, r));
}, Ys = (e, t, n = {}) => !t.languages || !t.languages.length ? (jt(t, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
  languages: t.languages
}), !0) : t.hasLoadedNamespace(e, {
  lng: n.lng,
  precheck: (r, i) => {
    if (n.bindI18n && n.bindI18n.indexOf("languageChanging") > -1 && r.services.backendConnector.backend && r.isLanguageChangingTo && !i(r.isLanguageChangingTo, e)) return !1;
  }
}), We = (e) => typeof e == "string", Qs = (e) => typeof e == "object" && e !== null, Xs = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g, Zs = {
  "&amp;": "&",
  "&#38;": "&",
  "&lt;": "<",
  "&#60;": "<",
  "&gt;": ">",
  "&#62;": ">",
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&#34;": '"',
  "&nbsp;": " ",
  "&#160;": " ",
  "&copy;": "©",
  "&#169;": "©",
  "&reg;": "®",
  "&#174;": "®",
  "&hellip;": "…",
  "&#8230;": "…",
  "&#x2F;": "/",
  "&#47;": "/"
}, eo = (e) => Zs[e], to = (e) => e.replace(Xs, eo);
let Dn = {
  bindI18n: "languageChanged",
  bindI18nStore: "",
  transEmptyNodeValue: "",
  transSupportBasicHtmlNodes: !0,
  transWrapTextNodes: "",
  transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
  useSuspense: !0,
  unescape: to,
  transDefaultProps: void 0
};
const no = (e = {}) => {
  Dn = {
    ...Dn,
    ...e
  };
}, ro = () => Dn;
let Qi;
const io = (e) => {
  Qi = e;
}, ao = () => Qi, so = {
  type: "3rdParty",
  init(e) {
    no(e.options.react), io(e);
  }
}, Xi = Jn();
class oo {
  constructor() {
    this.usedNamespaces = {};
  }
  addUsedNamespaces(t) {
    t.forEach((n) => {
      this.usedNamespaces[n] || (this.usedNamespaces[n] = !0);
    });
  }
  getUsedNamespaces() {
    return Object.keys(this.usedNamespaces);
  }
}
var Pt = { exports: {} }, sn = {};
var jr;
function lo() {
  if (jr) return sn;
  jr = 1;
  var e = je;
  function t(f, h) {
    return f === h && (f !== 0 || 1 / f === 1 / h) || f !== f && h !== h;
  }
  var n = typeof Object.is == "function" ? Object.is : t, r = e.useState, i = e.useEffect, a = e.useLayoutEffect, s = e.useDebugValue;
  function o(f, h) {
    var d = h(), p = r({ inst: { value: d, getSnapshot: h } }), m = p[0].inst, v = p[1];
    return a(
      function() {
        m.value = d, m.getSnapshot = h, u(m) && v({ inst: m });
      },
      [f, d, h]
    ), i(
      function() {
        return u(m) && v({ inst: m }), f(function() {
          u(m) && v({ inst: m });
        });
      },
      [f]
    ), s(d), d;
  }
  function u(f) {
    var h = f.getSnapshot;
    f = f.value;
    try {
      var d = h();
      return !n(f, d);
    } catch {
      return !0;
    }
  }
  function l(f, h) {
    return h();
  }
  var c = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? l : o;
  return sn.useSyncExternalStore = e.useSyncExternalStore !== void 0 ? e.useSyncExternalStore : c, sn;
}
var on = {};
var $r;
function uo() {
  return $r || ($r = 1, process.env.NODE_ENV !== "production" && (function() {
    function e(d, p) {
      return d === p && (d !== 0 || 1 / d === 1 / p) || d !== d && p !== p;
    }
    function t(d, p) {
      c || i.startTransition === void 0 || (c = !0, console.error(
        "You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."
      ));
      var m = p();
      if (!f) {
        var v = p();
        a(m, v) || (console.error(
          "The result of getSnapshot should be cached to avoid an infinite loop"
        ), f = !0);
      }
      v = s({
        inst: { value: m, getSnapshot: p }
      });
      var k = v[0].inst, S = v[1];
      return u(
        function() {
          k.value = m, k.getSnapshot = p, n(k) && S({ inst: k });
        },
        [d, m, p]
      ), o(
        function() {
          return n(k) && S({ inst: k }), d(function() {
            n(k) && S({ inst: k });
          });
        },
        [d]
      ), l(m), m;
    }
    function n(d) {
      var p = d.getSnapshot;
      d = d.value;
      try {
        var m = p();
        return !a(d, m);
      } catch {
        return !0;
      }
    }
    function r(d, p) {
      return p();
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var i = je, a = typeof Object.is == "function" ? Object.is : e, s = i.useState, o = i.useEffect, u = i.useLayoutEffect, l = i.useDebugValue, c = !1, f = !1, h = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? r : t;
    on.useSyncExternalStore = i.useSyncExternalStore !== void 0 ? i.useSyncExternalStore : h, typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), on;
}
var Br;
function co() {
  return Br || (Br = 1, process.env.NODE_ENV === "production" ? Pt.exports = lo() : Pt.exports = uo()), Pt.exports;
}
var fo = co();
const ho = (e, t) => {
  if (We(t)) return t;
  if (Qs(t) && We(t.defaultValue)) return t.defaultValue;
  if (typeof e == "function") return "";
  if (Array.isArray(e)) {
    const n = e[e.length - 1];
    return typeof n == "function" ? "" : n;
  }
  return e;
}, po = {
  t: ho,
  ready: !1
}, go = () => () => {
}, ee = (e, t = {}) => {
  const {
    i18n: n
  } = t, {
    i18n: r,
    defaultNS: i
  } = Yn(Xi) || {}, a = n || r || ao();
  a && !a.reportNamespaces && (a.reportNamespaces = new oo()), a || jt(a, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.");
  const s = xt(() => ({
    ...ro(),
    ...a?.options?.react,
    ...t
  }), [a, t]), {
    useSuspense: o,
    keyPrefix: u
  } = s, l = i || a?.options?.defaultNS, c = We(l) ? [l] : l || ["translation"], f = xt(() => c, c);
  a?.reportNamespaces?.addUsedNamespaces?.(f);
  const h = ae(0), d = Se((F) => {
    if (!a) return go;
    const {
      bindI18n: w,
      bindI18nStore: R
    } = s, D = () => {
      h.current += 1, F();
    };
    return w && a.on(w, D), R && a.store.on(R, D), () => {
      w && w.split(" ").forEach((z) => a.off(z, D)), R && R.split(" ").forEach((z) => a.store.off(z, D));
    };
  }, [a, s]), p = ae(), m = Se(() => {
    if (!a)
      return po;
    const F = !!(a.isInitialized || a.initializedStoreOnce) && f.every((O) => Ys(O, a, s)), w = t.lng || a.language, R = h.current, D = p.current;
    if (D && D.ready === F && D.lng === w && D.keyPrefix === u && D.revision === R)
      return D;
    const _ = {
      t: a.getFixedT(w, s.nsMode === "fallback" ? f : f[0], u, {
        scopeNs: f
      }),
      ready: F,
      lng: w,
      keyPrefix: u,
      revision: R
    };
    return p.current = _, _;
  }, [a, f, u, s, t.lng]), [v, k] = ne(0), {
    t: S,
    ready: C
  } = fo.useSyncExternalStore(d, m, m);
  te(() => {
    if (a && !C && !o) {
      const F = () => k((w) => w + 1);
      t.lng ? zr(a, t.lng, f, F) : Pn(a, f, F);
    }
  }, [a, t.lng, f, C, o, v]);
  const N = a || {}, A = ae(null), b = ae(), I = (F) => {
    const w = Object.getOwnPropertyDescriptors(F);
    w.__original && delete w.__original;
    const R = Object.create(Object.getPrototypeOf(F), w);
    if (!Object.prototype.hasOwnProperty.call(R, "__original"))
      try {
        Object.defineProperty(R, "__original", {
          value: F,
          writable: !1,
          enumerable: !1,
          configurable: !1
        });
      } catch {
      }
    return R;
  }, M = xt(() => {
    const F = N, w = F?.language;
    let R = F;
    F && (A.current && A.current.__original === F ? b.current !== w ? (R = I(F), A.current = R, b.current = w) : R = A.current : (R = I(F), A.current = R, b.current = w));
    const D = !C && !o ? (..._) => (jt(a, "USE_T_BEFORE_READY", "useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t."), S(..._)) : S, z = [D, R, C];
    return z.t = D, z.i18n = R, z.ready = C, z;
  }, [S, N, C, N.resolvedLanguage, N.language, N.languages]);
  if (a && o && !C) {
    let F = !1;
    try {
      F = process.env.NODE_ENV !== "production";
    } catch {
    }
    throw F && jt(a, "SUSPENDED_WHILE_LOADING", "useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook"), new Promise((w) => {
      const R = () => w();
      t.lng ? zr(a, t.lng, f, R) : Pn(a, f, R);
    });
  }
  return M;
};
function Zi({
  i18n: e,
  defaultNS: t,
  children: n
}) {
  const r = xt(() => ({
    i18n: e,
    defaultNS: t
  }), [e, t]);
  return Ui(Xi.Provider, {
    value: r
  }, n);
}
const Qn = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" }
], mo = {
  en: { translation: {
    appTitle: "FlowDesk Assistant",
    reset: "Start over",
    resetConfirm: "Start over? The current conversation and draft will be cleared.",
    emptyTitle: "How can I help?",
    emptySub: "Describe what you need — I will find the service and raise the request.",
    greeting: "Hello, {{name}}! How can I help you today?",
    greetingNoName: "Hello! How can I help you today?",
    capabilities: `I can help you:

- **Raise a service request** - I find the right service and fill the form with you
- **Look up your requests** - "my last one", "requests from June", however you describe it
- **Look up your tasks** - the same way
- **Search the knowledge base** - services, forms, what a field means
- **Explain what I can do, and what Altiora is for**

What would you like to do?`,
    thanks: "Your request has been created — I was glad to help. Reach out any time you need another request.",
    senderMe: "Me",
    agentName: "Altiora",
    composerPlaceholder: "Describe what you need…",
    composerDisabled: "Choose an option above…",
    composerHint: "Enter to send · Shift+Enter for a new line",
    send: "Send",
    stop: "Stop",
    micTooltip: "Voice input — coming soon",
    ttsTooltip: "Voice output — coming soon",
    voice: "Voice",
    thinking: "Thinking…",
    node: { LOAD_DRAFT: "Opening the draft…", ROUTER: "Understanding your request…", RESOLVE: "Finding the right service…", SLOT_EXTRACT: "Reading the details…", VALIDATE: "Checking the data…", PATCH: "Saving the draft…", ACTIVE_SLOTS: "Working out what else is needed…", RESOLVERS: "Looking up options…", TERM_CHECK: "Checking readiness…", QUESTION_PLANNER: "Preparing a question…", INFO_ANSWER: "Preparing an answer…", CONFIRM: "Assembling the request…", SUBMIT: "Submitting the request…" },
    choice: { yes: "✓ Yes, correct", chooseOther: "Choose another", cancel: "Cancel", done: "Done ({{count}})", skip: "Skip", search: "🔍 Search…", find: "Find", searchUser: "Name or email…", searchLocation: "Location name…" },
    date: { set: "Set date" },
    multichoice: { confirm: "Confirm selection", clear: "Clear" },
    freeInput: { submit: "Submit" },
    toggle: { on: "Yes", off: "No" },
    cascade: { accept: "Yes, that is correct", edit: "Enter manually" },
    draft: { title: "Request", empty: "No service selected yet.", emptyHint: "Describe your request in the chat — the draft will appear here.", beneficiary: "Recipient", forSelf: "for me", loading: "Loading fields…", collapse: "Collapse", expand: "Show draft", requestLabel: "Draft request" },
    phase: { context: "Context", routing: "Routing", detail: "Details" },
    provenance: { extracted: "Extracted from your message", user_edited: "Edited manually", context: "From your profile", resolved: "Determined by the system" },
    status: { idle: "draft", active: "draft", draft: "draft", confirmed: "confirming", submitted: "created", escalated: "escalated" },
    time: { justNow: "just now", minutesAgo: "{{count}} min ago" },
    meta: { details: "details ({{count}})" },
    slot: { required: "Required", edit: "Edit", stale: "Needs re-confirmation" },
    liveChat: "Live Chat",
    newChat: "New Chat",
    language: "Language",
    settings: { title: "AI Settings", open: "AI Settings", close: "Close", language: "Language", languageHint: "Used for AI responses and for voice and text recognition. Auto-detection is off.", voice: "Assistant voice", voiceDefault: "Default", voiceHint: "Voice used for the AI assistant’s spoken replies." },
    sources: { view: "View sources", title: "Sources", collection: "Collection", relevance: "Relevance", close: "Close" },
    review: { title: "Review your request", edit: "Edit", editField: "Edit {{field}}", editEcho: "Edit {{field}}" },
    explain: { trigger: "Explain {{title}}", triggerTooltip: "Get help with this" },
    navigate: { goThere: "Go there", goTo: "Navigate to {{path}}" },
    floatingChat: { defaultTitle: "Help", close: "Close" },
    stopped: "Request stopped.",
    "upload.attach": "Attach a document",
    "upload.attached": 'Attached "{{fileName}}". It will go with your request.',
    "upload.attachedReadable": 'Attached "{{fileName}}". Once you tell me what you need, I can read it and fill in what it contains.',
    "upload.failed": "The document could not be attached. Please try again."
  } },
  ru: { translation: {
    appTitle: "FlowDesk Ассистент",
    reset: "Начать заново",
    resetConfirm: "Начать заново? Текущий диалог и черновик будут очищены.",
    emptyTitle: "Чем могу помочь?",
    emptySub: "Опишите, что вам нужно — я подберу услугу и оформлю заявку.",
    greeting: "Здравствуйте, {{name}}! Чем могу помочь?",
    greetingNoName: "Здравствуйте! Чем могу помочь?",
    capabilities: `Я могу:

- **Оформить сервисную заявку** - найду нужный сервис и заполню форму вместе с вами
- **Показать ваши заявки** - «последняя», «за июнь», как удобно описать
- **Показать ваши задачи** - тем же способом
- **Найти в базе знаний** - сервисы, формы, значение поля
- **Рассказать, что я умею и для чего нужна Altiora**

С чего начнём?`,
    thanks: "Ваша заявка создана — рад был помочь. Обращайтесь, когда понадобится оформить ещё одну заявку.",
    senderMe: "Я",
    agentName: "Altiora",
    composerPlaceholder: "Опишите, что вам нужно…",
    composerDisabled: "Выберите вариант выше…",
    composerHint: "Enter — отправить · Shift+Enter — новая строка",
    send: "Отправить",
    stop: "Остановить",
    micTooltip: "Голосовой ввод — скоро",
    ttsTooltip: "Озвучивание ответов — скоро",
    voice: "Голос",
    thinking: "Думаю…",
    node: { LOAD_DRAFT: "Открываю черновик…", ROUTER: "Разбираю ваш запрос…", RESOLVE: "Ищу подходящую услугу…", SLOT_EXTRACT: "Извлекаю данные из сообщения…", VALIDATE: "Проверяю данные…", PATCH: "Сохраняю черновик…", ACTIVE_SLOTS: "Определяю, что ещё нужно…", RESOLVERS: "Подбираю варианты…", TERM_CHECK: "Проверяю готовность…", QUESTION_PLANNER: "Формулирую вопрос…", INFO_ANSWER: "Готовлю ответ…", CONFIRM: "Собираю заявку…", SUBMIT: "Оформляю заявку…" },
    choice: { yes: "✓ Да, верно", chooseOther: "Выбрать другого", cancel: "Отмена", done: "Готово ({{count}})", skip: "Пропустить", search: "🔍 Искать…", find: "Найти", searchUser: "Имя или email…", searchLocation: "Название локации…" },
    date: { set: "Указать дату" },
    multichoice: { confirm: "Подтвердить выбор", clear: "Очистить" },
    freeInput: { submit: "Отправить" },
    toggle: { on: "Да", off: "Нет" },
    cascade: { accept: "Да, всё верно", edit: "Ввести вручную" },
    draft: { title: "Заявка", empty: "Услуга ещё не выбрана.", emptyHint: "Опишите запрос в чате — черновик появится здесь.", beneficiary: "Получатель", forSelf: "для себя", loading: "Загружаю поля…", collapse: "Свернуть", expand: "Показать черновик", requestLabel: "Черновик заявки" },
    phase: { context: "Контекст", routing: "Маршрутизация", detail: "Детали" },
    provenance: { extracted: "Извлечено из сообщения", user_edited: "Изменено вручную", context: "Из вашего профиля", resolved: "Определено системой" },
    status: { idle: "черновик", active: "черновик", draft: "черновик", confirmed: "подтверждается", submitted: "создана", escalated: "эскалация" },
    time: { justNow: "только что", minutesAgo: "{{count}} мин назад" },
    meta: { details: "детали ({{count}})" },
    slot: { required: "Обязательно", edit: "Изменить", stale: "Требует переподтверждения" },
    liveChat: "Живой чат",
    newChat: "Новый чат",
    language: "Язык",
    settings: { title: "Настройки ИИ", open: "Настройки ИИ", close: "Закрыть", language: "Язык", languageHint: "Используется для ответов ИИ и распознавания голоса и текста. Автоопределение отключено.", voice: "Голос ассистента", voiceDefault: "По умолчанию", voiceHint: "Голос для устных ответов ассистента." },
    sources: { view: "Показать источники", title: "Источники", collection: "Коллекция", relevance: "Релевантность", close: "Закрыть" },
    review: { title: "Проверьте заявку", edit: "Изменить", editField: "Изменить «{{field}}»", editEcho: "Изменить «{{field}}»" },
    explain: { trigger: "Пояснить: {{title}}", triggerTooltip: "Получить помощь по этому" },
    navigate: { goThere: "Перейти", goTo: "Перейти к {{path}}" },
    floatingChat: { defaultTitle: "Помощь", close: "Закрыть" },
    stopped: "Запрос остановлен.",
    "upload.attach": "Прикрепить документ",
    "upload.attached": "Файл «{{fileName}}» прикреплён и уйдёт вместе с заявкой.",
    "upload.attachedReadable": "Файл «{{fileName}}» прикреплён. Как только вы скажете, что вам нужно, я смогу его прочитать и заполнить то, что в нём есть.",
    "upload.failed": "Не удалось прикрепить документ. Попробуйте ещё раз."
  } },
  fr: { translation: {
    appTitle: "Assistant FlowDesk",
    reset: "Recommencer",
    resetConfirm: "Recommencer ? La conversation et le brouillon actuels seront effacés.",
    emptyTitle: "Comment puis-je aider ?",
    emptySub: "Décrivez ce dont vous avez besoin — je trouverai le service et créerai la demande.",
    greeting: "Bonjour, {{name}} ! Comment puis-je vous aider aujourd’hui ?",
    greetingNoName: "Bonjour ! Comment puis-je vous aider aujourd’hui ?",
    capabilities: `Je peux :

- **Créer une demande de service** - je trouve le service et remplis le formulaire avec vous
- **Retrouver vos demandes** - « la dernière », « celles de juin »
- **Retrouver vos tâches** - de la même façon
- **Chercher dans la base de connaissances** - services, formulaires, sens d’un champ
- **Expliquer ce que je sais faire et à quoi sert Altiora**

Que souhaitez-vous faire ?`,
    thanks: "Votre demande a été créée — j’ai été ravi de vous aider. N’hésitez pas pour une prochaine demande.",
    senderMe: "Moi",
    agentName: "Altiora",
    composerPlaceholder: "Décrivez ce dont vous avez besoin…",
    composerDisabled: "Choisissez une option ci-dessus…",
    composerHint: "Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne",
    send: "Envoyer",
    stop: "Arrêter",
    micTooltip: "Saisie vocale — bientôt",
    ttsTooltip: "Sortie vocale — bientôt",
    voice: "Voix",
    thinking: "Réflexion…",
    choice: { yes: "✓ Oui, correct", chooseOther: "Choisir un autre", cancel: "Annuler", done: "Terminé ({{count}})", skip: "Ignorer", search: "🔍 Rechercher…", find: "Trouver", searchUser: "Nom ou e-mail…", searchLocation: "Nom du lieu…" },
    date: { set: "Définir la date" },
    multichoice: { confirm: "Confirmer la sélection", clear: "Effacer" },
    freeInput: { submit: "Envoyer" },
    toggle: { on: "Oui", off: "Non" },
    cascade: { accept: "Oui, correct", edit: "Saisir manuellement" },
    draft: { title: "Demande", empty: "Aucun service sélectionné.", emptyHint: "Décrivez votre demande dans le chat.", beneficiary: "Bénéficiaire", forSelf: "pour moi", loading: "Chargement…", collapse: "Réduire", expand: "Afficher", requestLabel: "Brouillon" },
    phase: { context: "Contexte", routing: "Routage", detail: "Détails" },
    status: { draft: "brouillon", confirmed: "confirmation", submitted: "créée", escalated: "escalade" },
    time: { justNow: "à l'instant", minutesAgo: "il y a {{count}} min" },
    meta: { details: "détails ({{count}})" },
    slot: { required: "Obligatoire", edit: "Modifier", stale: "À reconfirmer" },
    liveChat: "Chat en direct",
    newChat: "Nouveau chat",
    language: "Langue",
    settings: { title: "Paramètres IA", open: "Paramètres IA", close: "Fermer", language: "Langue", languageHint: "Utilisée pour les réponses de l’IA et la reconnaissance vocale et textuelle. La détection automatique est désactivée.", voice: "Voix de l’assistant", voiceDefault: "Par défaut", voiceHint: "Voix des réponses orales de l’assistant." },
    sources: { view: "Voir les sources", title: "Sources", collection: "Collection", relevance: "Pertinence", close: "Fermer" },
    review: { title: "Vérifiez votre demande", edit: "Modifier", editField: "Modifier « {{field}} »", editEcho: "Modifier « {{field}} »" },
    explain: { trigger: "Expliquer : {{title}}", triggerTooltip: "Obtenir de l’aide sur cet élément" },
    navigate: { goThere: "Y aller", goTo: "Aller à {{path}}" },
    floatingChat: { defaultTitle: "Aide", close: "Fermer" },
    stopped: "Demande arrêtée.",
    "upload.attach": "Joindre un document",
    "upload.attached": "Fichier « {{fileName}} » joint. Il accompagnera votre demande.",
    "upload.attachedReadable": "Fichier « {{fileName}} » joint. Dès que vous m’aurez dit ce qu’il vous faut, je pourrai le lire et remplir ce qu’il contient.",
    "upload.failed": "Le document n’a pas pu être joint. Veuillez réessayer."
  } },
  es: { translation: {
    appTitle: "Asistente FlowDesk",
    reset: "Empezar de nuevo",
    resetConfirm: "¿Empezar de nuevo? Se borrará la conversación y el borrador actuales.",
    emptyTitle: "¿En qué puedo ayudar?",
    emptySub: "Describa lo que necesita — encontraré el servicio y crearé la solicitud.",
    greeting: "¡Hola, {{name}}! ¿En qué puedo ayudarle hoy?",
    greetingNoName: "¡Hola! ¿En qué puedo ayudarle hoy?",
    capabilities: `Puedo:

- **Crear una solicitud de servicio** - busco el servicio y completo el formulario con usted
- **Consultar sus solicitudes** - «la última», «las de junio»
- **Consultar sus tareas** - del mismo modo
- **Buscar en la base de conocimiento** - servicios, formularios, qué significa un campo
- **Explicar qué puedo hacer y para qué sirve Altiora**

¿Por dónde empezamos?`,
    thanks: "Su solicitud ha sido creada — encantado de ayudar. Cuente conmigo para la próxima solicitud.",
    senderMe: "Yo",
    agentName: "Altiora",
    composerPlaceholder: "Describa lo que necesita…",
    composerDisabled: "Elija una opción arriba…",
    composerHint: "Enter para enviar · Mayús+Enter para una nueva línea",
    send: "Enviar",
    stop: "Detener",
    micTooltip: "Entrada de voz — próximamente",
    ttsTooltip: "Salida de voz — próximamente",
    voice: "Voz",
    thinking: "Pensando…",
    choice: { yes: "✓ Sí, correcto", chooseOther: "Elegir otro", cancel: "Cancelar", done: "Listo ({{count}})", skip: "Omitir", search: "🔍 Buscar…", find: "Buscar", searchUser: "Nombre o correo…", searchLocation: "Nombre del lugar…" },
    date: { set: "Establecer fecha" },
    multichoice: { confirm: "Confirmar selección", clear: "Borrar" },
    freeInput: { submit: "Enviar" },
    toggle: { on: "Sí", off: "No" },
    cascade: { accept: "Sí, correcto", edit: "Introducir manualmente" },
    draft: { title: "Solicitud", empty: "Ningún servicio seleccionado.", emptyHint: "Describa su solicitud en el chat.", beneficiary: "Beneficiario", forSelf: "para mí", loading: "Cargando…", collapse: "Contraer", expand: "Mostrar", requestLabel: "Borrador" },
    phase: { context: "Contexto", routing: "Enrutamiento", detail: "Detalles" },
    status: { draft: "borrador", confirmed: "confirmando", submitted: "creada", escalated: "escalada" },
    time: { justNow: "ahora mismo", minutesAgo: "hace {{count}} min" },
    meta: { details: "detalles ({{count}})" },
    slot: { required: "Obligatorio", edit: "Editar", stale: "Requiere reconfirmación" },
    liveChat: "Chat en vivo",
    newChat: "Nuevo chat",
    language: "Idioma",
    settings: { title: "Ajustes de IA", open: "Ajustes de IA", close: "Cerrar", language: "Idioma", languageHint: "Se usa para las respuestas de la IA y el reconocimiento de voz y texto. La detección automática está desactivada.", voice: "Voz del asistente", voiceDefault: "Predeterminada", voiceHint: "Voz de las respuestas habladas del asistente." },
    sources: { view: "Ver fuentes", title: "Fuentes", collection: "Colección", relevance: "Relevancia", close: "Cerrar" },
    review: { title: "Revise su solicitud", edit: "Editar", editField: "Editar «{{field}}»", editEcho: "Editar «{{field}}»" },
    explain: { trigger: "Explicar: {{title}}", triggerTooltip: "Obtener ayuda sobre esto" },
    navigate: { goThere: "Ir allí", goTo: "Ir a {{path}}" },
    floatingChat: { defaultTitle: "Ayuda", close: "Cerrar" },
    stopped: "Solicitud detenida.",
    "upload.attach": "Adjuntar un documento",
    "upload.attached": "Se adjuntó «{{fileName}}». Acompañará a su solicitud.",
    "upload.attachedReadable": "Se adjuntó «{{fileName}}». En cuanto me diga qué necesita, podré leerlo y completar lo que contenga.",
    "upload.failed": "No se pudo adjuntar el documento. Inténtelo de nuevo."
  } },
  ar: { translation: {
    appTitle: "مساعد FlowDesk",
    reset: "البدء من جديد",
    resetConfirm: "البدء من جديد؟ سيتم مسح المحادثة والمسودة الحاليتين.",
    emptyTitle: "كيف يمكنني المساعدة؟",
    emptySub: "صف ما تحتاجه — سأجد الخدمة وأنشئ الطلب.",
    greeting: "مرحبًا، {{name}}! كيف يمكنني مساعدتك اليوم؟",
    greetingNoName: "مرحبًا! كيف يمكنني مساعدتك اليوم؟",
    capabilities: `يمكنني:

- **إنشاء طلب خدمة** - أجد الخدمة المناسبة وأملأ النموذج معك
- **عرض طلباتك** - «آخر طلب»، «طلبات يونيو»
- **عرض مهامك** - بالطريقة نفسها
- **البحث في قاعدة المعرفة** - الخدمات والنماذج ومعنى الحقول
- **شرح ما يمكنني فعله والغرض من Altiora**

من أين نبدأ؟`,
    thanks: "تم إنشاء طلبك — سعدت بمساعدتك. تواصل معي في أي وقت لطلب آخر.",
    senderMe: "أنا",
    agentName: "Altiora",
    composerPlaceholder: "صف ما تحتاجه…",
    composerDisabled: "اختر خياراً أعلاه…",
    composerHint: "Enter للإرسال · Shift+Enter لسطر جديد",
    send: "إرسال",
    stop: "إيقاف",
    micTooltip: "الإدخال الصوتي — قريباً",
    ttsTooltip: "الإخراج الصوتي — قريباً",
    voice: "صوت",
    thinking: "جارٍ التفكير…",
    choice: { yes: "✓ نعم، صحيح", chooseOther: "اختر آخر", cancel: "إلغاء", done: "تم ({{count}})", skip: "تخطي", search: "🔍 بحث…", find: "بحث", searchUser: "الاسم أو البريد…", searchLocation: "اسم الموقع…" },
    date: { set: "تحديد التاريخ" },
    multichoice: { confirm: "تأكيد الاختيار", clear: "مسح" },
    freeInput: { submit: "إرسال" },
    toggle: { on: "نعم", off: "لا" },
    cascade: { accept: "نعم، صحيح", edit: "إدخال يدوي" },
    draft: { title: "طلب", empty: "لم يتم اختيار خدمة.", emptyHint: "صف طلبك في المحادثة.", beneficiary: "المستفيد", forSelf: "لي", loading: "جارٍ التحميل…", collapse: "طيّ", expand: "عرض", requestLabel: "مسودة" },
    phase: { context: "السياق", routing: "التوجيه", detail: "التفاصيل" },
    status: { draft: "مسودة", confirmed: "قيد التأكيد", submitted: "تم الإنشاء", escalated: "تصعيد" },
    time: { justNow: "الآن", minutesAgo: "قبل {{count}} دقيقة" },
    meta: { details: "تفاصيل ({{count}})" },
    slot: { required: "مطلوب", edit: "تعديل", stale: "يحتاج إعادة تأكيد" },
    liveChat: "دردشة مباشرة",
    newChat: "محادثة جديدة",
    language: "اللغة",
    settings: { title: "إعدادات الذكاء الاصطناعي", open: "إعدادات الذكاء الاصطناعي", close: "إغلاق", language: "اللغة", languageHint: "تُستخدم لردود الذكاء الاصطناعي وللتعرف على الصوت والنص. الكشف التلقائي معطّل.", voice: "صوت المساعد", voiceDefault: "افتراضي", voiceHint: "الصوت المستخدم لردود المساعد المنطوقة." },
    sources: { view: "عرض المصادر", title: "المصادر", collection: "المجموعة", relevance: "الصلة", close: "إغلاق" },
    review: { title: "راجع طلبك", edit: "تعديل", editField: "تعديل «{{field}}»", editEcho: "تعديل «{{field}}»" },
    explain: { trigger: "شرح: {{title}}", triggerTooltip: "احصل على مساعدة بشأن هذا" },
    navigate: { goThere: "الذهاب إلى هناك", goTo: "الانتقال إلى {{path}}" },
    floatingChat: { defaultTitle: "مساعدة", close: "إغلاق" },
    stopped: "تم إيقاف الطلب.",
    "upload.attach": "إرفاق مستند",
    "upload.attached": "تم إرفاق «{{fileName}}». سيُرسل مع طلبك.",
    "upload.attachedReadable": "تم إرفاق «{{fileName}}». حالما تخبرني بما تحتاجه، يمكنني قراءته وتعبئة ما يحتويه.",
    "upload.failed": "تعذّر إرفاق المستند. يرجى المحاولة مرة أخرى."
  } },
  zh: { translation: {
    appTitle: "FlowDesk 助手",
    reset: "重新开始",
    resetConfirm: "重新开始？当前对话和草稿将被清除。",
    emptyTitle: "有什么可以帮您？",
    emptySub: "描述您的需求——我会找到相应服务并创建请求。",
    greeting: "您好，{{name}}！今天有什么可以帮您？",
    greetingNoName: "您好！今天有什么可以帮您？",
    capabilities: `我可以：

- **提交服务请求** - 找到对应服务并与您一起填写表单
- **查看您的请求** - “最近一次”“六月的”，怎么描述都行
- **查看您的任务** - 方式相同
- **搜索知识库** - 服务、表单、字段含义
- **说明我能做什么，以及 Altiora 的用途**

从哪里开始？`,
    thanks: "您的请求已创建——很高兴能帮到您。需要再提交请求时随时找我。",
    senderMe: "我",
    agentName: "Altiora",
    composerPlaceholder: "描述您的需求……",
    composerDisabled: "请选择上方选项……",
    composerHint: "Enter 发送 · Shift+Enter 换行",
    send: "发送",
    stop: "停止",
    micTooltip: "语音输入——即将推出",
    ttsTooltip: "语音输出——即将推出",
    voice: "语音",
    thinking: "思考中……",
    choice: { yes: "✓ 是的，正确", chooseOther: "选择其他", cancel: "取消", done: "完成 ({{count}})", skip: "跳过", search: "🔍 搜索……", find: "查找", searchUser: "姓名或邮箱……", searchLocation: "地点名称……" },
    date: { set: "设置日期" },
    multichoice: { confirm: "确认选择", clear: "清除" },
    freeInput: { submit: "提交" },
    toggle: { on: "是", off: "否" },
    cascade: { accept: "是的，正确", edit: "手动输入" },
    draft: { title: "请求", empty: "尚未选择服务。", emptyHint: "在聊天中描述您的请求。", beneficiary: "接收人", forSelf: "给我", loading: "加载中……", collapse: "收起", expand: "显示", requestLabel: "草稿" },
    phase: { context: "背景", routing: "路由", detail: "详情" },
    status: { draft: "草稿", confirmed: "确认中", submitted: "已创建", escalated: "升级" },
    time: { justNow: "刚刚", minutesAgo: "{{count}} 分钟前" },
    meta: { details: "详情（{{count}}）" },
    slot: { required: "必填", edit: "编辑", stale: "需要重新确认" },
    liveChat: "在线客服",
    newChat: "新对话",
    language: "语言",
    settings: { title: "AI 设置", open: "AI 设置", close: "关闭", language: "语言", languageHint: "用于 AI 回复以及语音和文本识别。已关闭自动检测。", voice: "助手语音", voiceDefault: "默认", voiceHint: "用于助手语音回复的声音。" },
    sources: { view: "查看来源", title: "来源", collection: "集合", relevance: "相关性", close: "关闭" },
    review: { title: "请核对您的请求", edit: "编辑", editField: "编辑“{{field}}”", editEcho: "编辑“{{field}}”" },
    explain: { trigger: "说明：{{title}}", triggerTooltip: "获取关于此项的帮助" },
    navigate: { goThere: "前往", goTo: "导航到 {{path}}" },
    floatingChat: { defaultTitle: "帮助", close: "关闭" },
    stopped: "请求已停止。",
    "upload.attach": "附加文档",
    "upload.attached": "已附加“{{fileName}}”，它将随您的请求一起提交。",
    "upload.attachedReadable": "已附加“{{fileName}}”。等您告诉我需要什么，我就可以读取它并填写其中的内容。",
    "upload.failed": "无法附加该文档，请重试。"
  } }
}, ea = "fdv2-lang", ue = he.createInstance();
ue.use(so).init({
  resources: mo,
  lng: typeof localStorage < "u" && localStorage.getItem(ea) || "en",
  fallbackLng: "en",
  supportedLngs: Qn.map((e) => e.code),
  interpolation: { escapeValue: !1 },
  react: { useSuspense: !1 }
});
function yo(e) {
  const t = Qn.find((n) => n.code === e);
  return t ? t.dir : "ltr";
}
function rt() {
  return ue.language || "en";
}
function Vr() {
  return yo(rt());
}
function bo(e) {
  ue.changeLanguage(e);
  try {
    localStorage.setItem(ea, e);
  } catch {
  }
}
const Hr = (e) => {
  let t;
  const n = /* @__PURE__ */ new Set(), r = (l, c) => {
    const f = typeof l == "function" ? l(t) : l;
    if (!Object.is(f, t)) {
      const h = t;
      t = c ?? (typeof f != "object" || f === null) ? f : Object.assign({}, t, f), n.forEach((d) => d(t, h));
    }
  }, i = () => t, o = { setState: r, getState: i, getInitialState: () => u, subscribe: (l) => (n.add(l), () => n.delete(l)) }, u = t = e(r, i, o);
  return o;
}, xo = ((e) => e ? Hr(e) : Hr), ko = (e) => e;
function vo(e, t = ko) {
  const n = je.useSyncExternalStore(
    e.subscribe,
    je.useCallback(() => t(e.getState()), [e, t]),
    je.useCallback(() => t(e.getInitialState()), [e, t])
  );
  return je.useDebugValue(n), n;
}
const Ur = (e) => {
  const t = xo(e), n = (r) => vo(t, r);
  return Object.assign(n, t), n;
}, wo = ((e) => e ? Ur(e) : Ur);
function ta(e, t) {
  let n;
  try {
    n = e();
  } catch {
    return;
  }
  return {
    getItem: (i) => {
      var a;
      const s = (u) => u === null ? null : JSON.parse(u, void 0), o = (a = n.getItem(i)) != null ? a : null;
      return o instanceof Promise ? o.then(s) : s(o);
    },
    setItem: (i, a) => n.setItem(i, JSON.stringify(a, void 0)),
    removeItem: (i) => n.removeItem(i)
  };
}
const _n = (e) => (t) => {
  try {
    const n = e(t);
    return n instanceof Promise ? n : {
      then(r) {
        return _n(r)(n);
      },
      catch(r) {
        return this;
      }
    };
  } catch (n) {
    return {
      then(r) {
        return this;
      },
      catch(r) {
        return _n(r)(n);
      }
    };
  }
}, So = (e, t) => (n, r, i) => {
  let a = {
    storage: ta(() => window.localStorage),
    partialize: (v) => v,
    version: 0,
    merge: (v, k) => ({
      ...k,
      ...v
    }),
    ...t
  }, s = !1, o = 0;
  const u = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set();
  let c = a.storage;
  if (!c)
    return e(
      (...v) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${a.name}', the given storage is currently unavailable.`
        ), n(...v);
      },
      r,
      i
    );
  const f = () => {
    const v = a.partialize({ ...r() });
    return c.setItem(a.name, {
      state: v,
      version: a.version
    });
  }, h = i.setState;
  i.setState = (v, k) => (h(v, k), f());
  const d = e(
    (...v) => (n(...v), f()),
    r,
    i
  );
  i.getInitialState = () => d;
  let p;
  const m = () => {
    var v, k;
    if (!c) return;
    const S = ++o;
    s = !1, u.forEach((N) => {
      var A;
      return N((A = r()) != null ? A : d);
    });
    const C = ((k = a.onRehydrateStorage) == null ? void 0 : k.call(a, (v = r()) != null ? v : d)) || void 0;
    return _n(c.getItem.bind(c))(a.name).then((N) => {
      if (N)
        if (typeof N.version == "number" && N.version !== a.version) {
          if (a.migrate) {
            const A = a.migrate(
              N.state,
              N.version
            );
            return A instanceof Promise ? A.then((b) => [!0, b]) : [!0, A];
          }
          console.error(
            "State loaded from storage couldn't be migrated since no migrate function was provided"
          );
        } else
          return [!1, N.state];
      return [!1, void 0];
    }).then((N) => {
      var A;
      if (S !== o)
        return;
      const [b, I] = N;
      if (p = a.merge(
        I,
        (A = r()) != null ? A : d
      ), n(p, !0), b)
        return f();
    }).then(() => {
      S === o && (C?.(r(), void 0), p = r(), s = !0, l.forEach((N) => N(p)));
    }).catch((N) => {
      S === o && C?.(void 0, N);
    });
  };
  return i.persist = {
    setOptions: (v) => {
      a = {
        ...a,
        ...v
      }, v.storage && (c = v.storage);
    },
    clearStorage: () => {
      c?.removeItem(a.name);
    },
    getOptions: () => a,
    rehydrate: () => m(),
    hasHydrated: () => s,
    onHydrate: (v) => (u.add(v), () => {
      u.delete(v);
    }),
    onFinishHydration: (v) => (l.add(v), () => {
      l.delete(v);
    })
  }, a.skipHydration || m(), p || d;
}, Co = So, qr = (e) => Symbol.iterator in e, Kr = (e) => (
  // HACK: avoid checking entries type
  "entries" in e
), Wr = (e, t) => {
  const n = e instanceof Map ? e : new Map(e.entries()), r = t instanceof Map ? t : new Map(t.entries());
  if (n.size !== r.size)
    return !1;
  for (const [i, a] of n)
    if (!r.has(i) || !Object.is(a, r.get(i)))
      return !1;
  return !0;
}, Eo = (e, t) => {
  const n = e[Symbol.iterator](), r = t[Symbol.iterator]();
  let i = n.next(), a = r.next();
  for (; !i.done && !a.done; ) {
    if (!Object.is(i.value, a.value))
      return !1;
    i = n.next(), a = r.next();
  }
  return !!i.done && !!a.done;
};
function No(e, t) {
  return Object.is(e, t) ? !0 : typeof e != "object" || e === null || typeof t != "object" || t === null || Object.getPrototypeOf(e) !== Object.getPrototypeOf(t) ? !1 : qr(e) && qr(t) ? Kr(e) && Kr(t) ? Wr(e, t) : Eo(e, t) : Wr(
    { entries: () => Object.entries(e) },
    { entries: () => Object.entries(t) }
  );
}
function Xn(e) {
  const t = je.useRef(void 0);
  return (n) => {
    const r = e(n);
    return No(t.current, r) ? t.current : t.current = r;
  };
}
const Fn = {
  apiBaseUrl: "",
  userId: "fdv2-demo-user",
  getAuthHeaders: null,
  fetchImpl: null,
  eventSourceImpl: null,
  onSubmitted: null,
  onError: null,
  onSessionStart: null,
  // REQ-005 — the host opens its own detail dialog when a row in the chat is clicked.
  // Declared here because `configureChat` copies only the keys it already knows: a
  // callback the host passes and this list does not name is dropped without a word,
  // and the rows would simply never open.
  onReveal: null,
  // Host's own dev/prod flag (e.g. import.meta.env.DEV) — NOT this package's own build
  // mode, which is baked in as "production" once bundled regardless of who consumes it.
  debug: !1
};
let Ge = { ...Fn };
function Io(e = {}) {
  const t = { ...Fn };
  for (const n of Object.keys(Fn))
    e[n] !== void 0 && e[n] !== null && (t[n] = e[n]);
  Ge = t;
}
function we() {
  return Ge;
}
function Zn(e) {
  const t = (Ge.apiBaseUrl || "").replace(/\/+$/, "");
  if (!t)
    throw new Error(
      '[altiora-chat] apiBaseUrl is not configured. Pass it to <AltioraChat apiBaseUrl="https://host/api/v1" />.'
    );
  return `${t}${e}`;
}
function De() {
  return Ge.fetchImpl || globalThis.fetch.bind(globalThis);
}
async function Le(e = {}) {
  const t = typeof Ge.getAuthHeaders == "function" ? await Ge.getAuthHeaders() : null;
  return { ...e, ...t || {} };
}
function Gr(e, ...t) {
  const n = Ge[e];
  if (typeof n == "function")
    try {
      n(...t);
    } catch (r) {
      console.error(`[flowdesk-chat-v2] ${e} callback threw:`, r);
    }
}
class J extends Error {
  constructor(t, n) {
    super(n), this.name = "ChatError", this.code = t;
  }
}
const To = 12e4, Lo = 3, $e = (e) => Zn(e);
async function na(e) {
  let t;
  try {
    t = await De()($e(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      headers: await Le()
    });
  } catch (n) {
    throw new J("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new J("SERVER", `getDraft HTTP ${t.status}`);
  return t.json();
}
async function Ao(e) {
  let t;
  try {
    t = await De()($e(`/flowdesk/voice/transcript/${encodeURIComponent(e)}`), {
      headers: await Le()
    });
  } catch (r) {
    throw new J("NETWORK", r.message);
  }
  if (t.status === 404) return [];
  if (!t.ok) throw new J("SERVER", `getVoiceTranscript HTTP ${t.status}`);
  const n = await t.json();
  return Array.isArray(n.messages) ? n.messages : [];
}
async function Ro(e) {
  let t;
  try {
    t = await De()($e(`/flowdesk/schema/${encodeURIComponent(e)}`), {
      headers: await Le()
    });
  } catch (n) {
    throw new J("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new J("SERVER", `getSchema HTTP ${t.status}`);
  return t.json();
}
async function Oo(e, t) {
  let n;
  try {
    n = await De()($e(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      method: "PATCH",
      headers: await Le({ "Content-Type": "application/json" }),
      body: JSON.stringify({ patches: t })
    });
  } catch (i) {
    throw new J("NETWORK", i.message);
  }
  const r = await n.json().catch(() => ({}));
  if (r.error) throw new J("SERVER", typeof r.error == "string" ? r.error : r.detail || "patch failed");
  if (!n.ok) throw new J("SERVER", `patchDraft HTTP ${n.status}`);
  return r;
}
async function Po(e, t, { signal: n } = {}) {
  const r = new FormData();
  r.append("file", t, t.name || "document");
  let i;
  try {
    i = await De()($e(`/flowdesk/chat/upload?sessionId=${encodeURIComponent(e)}`), {
      method: "POST",
      body: r,
      headers: await Le(),
      signal: n
    });
  } catch (s) {
    throw new J("NETWORK", s.message);
  }
  const a = await i.json().catch(() => ({}));
  if (!i.ok) throw new J(a.code || "UPLOAD_FAILED", a.error || `upload HTTP ${i.status}`);
  return a;
}
async function ra(e, t, { signal: n } = {}) {
  let r;
  try {
    r = await De()($e(`/flowdesk/chat/attachments/link?sessionId=${encodeURIComponent(e)}`), {
      method: "POST",
      headers: await Le({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ticketId: t }),
      signal: n
    });
  } catch (a) {
    throw new J("NETWORK", a.message);
  }
  const i = await r.json().catch(() => ({}));
  if (!r.ok) throw new J(i.code || "LINK_FAILED", i.error || `link HTTP ${r.status}`);
  return i;
}
async function Do(e, t, n = {}) {
  const r = e && e.stagedAttachments || [];
  if (!r.length) return null;
  const i = e && e.sessionId || r[0] && r[0].stagedUnder && r[0].stagedUnder.ownerId || null;
  return !i || t === void 0 || t === null || t === "" ? null : ra(i, t, n);
}
async function _o(e, t, n, { signal: r, choice: i, controlAction: a, anchor: s, formEvent: o, lang: u, userContext: l } = {}) {
  const c = new AbortController(), f = setTimeout(() => c.abort(), To);
  r && r.addEventListener("abort", () => c.abort(), { once: !0 });
  const h = { sessionId: e, userId: t, lang: u, ...l ? { userContext: l } : {} }, d = s ? { ...h, anchor: s } : a ? { ...h, controlAction: a } : i ? { ...h, choice: i } : o ? { ...h, formEvent: o } : { ...h, message: n };
  let p;
  try {
    p = await De()($e("/flowdesk/chat"), {
      method: "POST",
      headers: await Le({ "Content-Type": "application/json" }),
      body: JSON.stringify(d),
      signal: c.signal
    });
  } catch (k) {
    throw clearTimeout(f), k.name === "AbortError" ? new J("TIMEOUT", "The assistant took too long to respond.") : new J("NETWORK", k.message);
  }
  clearTimeout(f);
  const m = await p.json().catch(() => {
    throw new J("SERVER", `Non-JSON response (HTTP ${p.status})`);
  });
  if (m.error) throw new J("SERVER", typeof m.error == "string" ? m.error : m.detail || "Chat failed");
  if (!p.ok) throw new J("SERVER", `chat HTTP ${p.status}`);
  let v = null;
  try {
    v = await na(e);
  } catch {
  }
  return { ...m, draft: v };
}
const vg = ["connected", "turn:start", "node:start", "node:done", "turn:done"];
function Fo(e, t = {}, n = {}) {
  const r = n.EventSourceImpl || we().eventSourceImpl || (typeof EventSource < "u" ? EventSource : null);
  if (!r)
    return t.onError?.(new J("SSE_DISCONNECT", "EventSource unavailable")), () => {
    };
  let i;
  try {
    i = $e(`/flowdesk/chat/${encodeURIComponent(e)}/stream`);
  } catch (f) {
    return t.onError?.(new J("SSE_DISCONNECT", f.message)), () => {
    };
  }
  let a = null, s = 0, o = !1, u = null;
  const l = (f) => {
    try {
      return JSON.parse(f.data);
    } catch {
      return {};
    }
  }, c = () => {
    a = new r(i, { withCredentials: !0 }), a.onopen = () => {
      s = 0;
    }, a.addEventListener("connected", (f) => t.onConnected?.(l(f))), a.addEventListener("turn:start", (f) => t.onTurnStart?.(l(f))), a.addEventListener("turn:done", (f) => t.onTurnDone?.(l(f))), a.addEventListener("node:start", (f) => {
      const h = l(f);
      t.onNode?.(h.node, "start", h);
    }), a.addEventListener("node:done", (f) => {
      const h = l(f);
      t.onNode?.(h.node, "done", h);
    }), a.onerror = () => {
      if (o) return;
      try {
        a.close();
      } catch {
      }
      if (s >= Lo) {
        t.onError?.(new J("SSE_DISCONNECT", "Lost progress stream"));
        return;
      }
      s += 1;
      const f = Math.min(1e3 * 2 ** (s - 1), 8e3);
      u = setTimeout(() => {
        o || c();
      }, f);
    };
  };
  return c(), function() {
    o = !0, u && clearTimeout(u);
    try {
      a && a.close();
    } catch {
    }
  };
}
const be = { sendMessage: _o, getDraft: na, patchDraft: Oo, subscribeProgress: Fo, getSchema: Ro, getVoiceTranscript: Ao, uploadFile: Po, linkAttachments: ra, linkStagedAttachments: Do };
let Jr = 0;
function ln(e, t, n) {
  return Jr += 1, { id: `m${Date.now()}_${Jr}`, role: e, content: t, timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadata: n || null };
}
function ht(e) {
  console.error("[flowdesk-chat-v2] turn failed:", e);
  const t = {
    NETWORK: "I'm having trouble reaching the server. Check your connection and try again.",
    TIMEOUT: "That took too long to respond — please try again.",
    SSE_DISCONNECT: "I lost the live connection, but you can keep chatting."
  }[e.code] || "Something went wrong on my end. Please try again in a moment.", n = we().debug ? `${e.code} — ${e.message}` : null;
  return { text: t, metadata: { kind: "chat-error", debugDetail: n } };
}
function pt(e) {
  return {
    choices: e.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(e.controls) ? e.controls : null,
    // REQ-005 — rows the turn SHOWS (requests, tasks). A separate field from
    // `controls` because they collect nothing; see the backend contract.
    cards: Array.isArray(e.cards) ? e.cards : null,
    responseType: e.responseType || "text",
    preamble: e.preamble || null,
    resolveChoices: e.resolveChoices || null,
    // sources[] (Phase 2 "Show sources") — KB origins of the answer, carried from
    // the backend turn response (top-level `sources`). Always an array so the
    // bubble can render a bottom-right icon only when there is at least one.
    sources: Array.isArray(e.sources) ? e.sources : [],
    // navigate (Phase 5 SITE_NAVIGATE) — {path, highlight?} destination; the bubble
    // renders a "Go there" link that calls the host onNavigate. Null when absent.
    navigate: e.navigate || null,
    // review (confirm-form) — grouped summary of collected values; the bubble renders
    // it as a table with a per-editable-row ✎ button.
    review: e.review || null,
    // Hand-off to Altiora's own request form (P1: the wizard opens prefilled).
    openForm: e.openForm || null,
    // sessionEnded — the backend saying, in as many words, that it closed its side of
    // this conversation. It travels with openForm today; carried separately so an
    // ending that is NOT a form hand-off needs no new client contract.
    sessionEnded: e.sessionEnded || null,
    executionLog: e.executionLog || null,
    srNumber: e.spawnResult?.requestId || e.state?.srNumber || null,
    isComplete: !!e.isComplete,
    // Chat-agent read intents: structured payloads a host chrome may render richly.
    ...Array.isArray(e.tickets) ? { tickets: e.tickets, totalCount: e.totalCount } : {},
    ...Array.isArray(e.breadcrumb) ? { breadcrumb: e.breadcrumb } : {}
  };
}
function Mo() {
  return `fdv2-${typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}
const un = () => ({ id: Mo(), serviceId: null, schemaVersion: null, status: "idle" }), tt = () => ({ slots: {}, beneficiary: null, patches: [] }), cn = () => ({ loading: !1, error: null, currentNode: null, composerDisabled: !1, draftPanelOpen: !0, completed: !1, uploading: !1 });
function zo(e) {
  let t = { sessionId: null, unsub: null };
  function n(i, a, s) {
    if (t.sessionId === i && t.unsub) return;
    if (t.unsub)
      try {
        t.unsub();
      } catch {
      }
    const o = be.subscribeProgress(i, {
      onNode: (u, l) => a(l === "start" ? u : null),
      onTurnDone: () => s()
    });
    t = { sessionId: i, unsub: o };
  }
  function r() {
    if (t.unsub)
      try {
        t.unsub();
      } catch {
      }
    t = { sessionId: null, unsub: null };
  }
  return wo(
    Co(
      (i, a) => ({
        session: un(),
        messages: [],
        // DOC-3 — documents attached to this conversation, staged server-side and
        // waiting to follow the request onto its ticket. Not persisted: the ids
        // are meaningless without the session they were staged under.
        attachments: [],
        draft: tt(),
        schema: null,
        // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
        user: null,
        // the current user profile (from the host) — identity + greeting
        anchorContext: null,
        // Phase 3: UI-anchor the chat was opened from (Phase 4 zero-query source)
        ui: cn(),
        actions: {
          /** Append a message (any role). Returns the created message. */
          addMessage: (s, o, u) => {
            const l = ln(s, o, u);
            return i((c) => ({ messages: [...c.messages, l] })), l;
          },
          /**
           * Set the current user profile (host prop). Idempotent for the same userId.
           *
           * Does NOT seed the greeting. It used to, and that meant a chat panel put a
           * conversation on screen as soon as the page loaded — before the user had
           * shown any interest in it — which collapsed the host's own empty state and
           * changed the look of the landing page. The greeting is seeded when the user
           * focuses the composer instead: identity is known at mount, but the opening
           * message belongs to the moment they turn towards the chat.
           */
          setUser: (s) => {
            !s || !s.userId || a().user && a().user.userId === s.userId || i(() => ({ user: s }));
          },
          /** Seed the first assistant message: greeting by FIRST name, in the selected language. */
          seedGreeting: () => {
            const s = a().user;
            if (!s || a().messages.length > 0 || a().anchorContext) return;
            const o = s.firstName || (s.displayName ? String(s.displayName).split(/\s+/)[0] : "") || s.name || "", l = `${o ? ue.t("greeting", { name: o }) : ue.t("greetingNoName")}

${ue.t("capabilities")}`;
            a().actions.addMessage("assistant", l, { responseType: "greeting" });
          },
          /**
           * DOC-3 — attach a document to the conversation.
           *
           * The upload is its own step, not a turn: nothing is sent to the model
           * here. The assistant reads the file only when the conversation reaches
           * a point where reading it helps, which needs a chosen service — so a
           * file attached before that is staged and waits, and saying "attached"
           * is the whole of the feedback the user gets now.
           *
           * `canExtract` comes back from the server and is NOT the same as "the
           * upload worked": Altiora accepts .docx and .xlsx, which travel with the
           * request but which the assistant cannot open. The message says which
           * happened, so nobody is left expecting the contents to be understood.
           */
          uploadAttachment: async (s, { signal: o } = {}) => {
            const { actions: u } = a(), l = a().session.id;
            if (!s || !l || a().ui.uploading) return null;
            i((c) => ({ ui: { ...c.ui, uploading: !0, error: null } }));
            try {
              const c = await be.uploadFile(l, s, { signal: o });
              return i((f) => ({ attachments: [...(f.attachments || []).filter((h) => h.attachmentId !== c.attachmentId), c] })), u.addMessage("system", ue.t(
                c.canExtract ? "upload.attachedReadable" : "upload.attached",
                { fileName: c.fileName }
              ), { attachment: c }), c;
            } catch (c) {
              const f = c.code === "NETWORK" ? ue.t("upload.failed") : c.message;
              return u.setError({ code: c.code, message: f }), u.addMessage("system", `⚠️ ${f}`), null;
            } finally {
              i((c) => ({ ui: { ...c.ui, uploading: !1 } }));
            }
          },
          /**
           * DOC-5 — the documents follow the request onto its ticket.
           *
           * Called once the form reports what it created. Deliberately quiet: the
           * request is already submitted, so a failure here is not the user's
           * problem to solve mid-flow — it is logged, the server keeps the staged
           * copies, and nothing about the submission is undone.
           */
          linkAttachments: async (s) => {
            const o = a().session.id;
            if (!s || !o || !(a().attachments || []).length) return null;
            try {
              return await be.linkAttachments(o, s);
            } catch (u) {
              return console.warn("[fdv2] attaching the documents to the request failed:", u.message), null;
            }
          },
          /** Send a turn: optimistic user message → SSE progress + POST → assistant
           *  reply + draft refresh. SSE stays open across turns for the session. */
          sendMessage: async (s, o, u) => {
            const l = (s || "").trim();
            if (!l || a().ui.loading) return;
            const { actions: c } = a(), f = a().session.id, h = a().user?.userId || o || we().userId;
            c.addMessage("user", l), i((d) => ({ ui: { ...d.ui, loading: !0, error: null, currentNode: null } })), n(f, c.setCurrentNode, () => c.setCurrentNode(null));
            try {
              const d = await be.sendMessage(f, h, l, { signal: u, lang: rt(), userContext: a().user || void 0 });
              c.addMessage("assistant", d.response, pt(d)), d.draft && c.updateDraft(d.draft), c.applyTurnResult(d);
              const p = d?.state?.serviceId;
              if (p && a().schema?.serviceId !== p)
                try {
                  const m = await be.getSchema(p);
                  m && i(() => ({ schema: m }));
                } catch {
                }
            } catch (d) {
              if (u?.aborted) {
                i((k) => ({ ui: { ...k.ui, loading: !1, currentNode: null } })), c.addMessage("system", ue.t("stopped"));
                return;
              }
              const p = d instanceof J ? d : new J("SERVER", d.message);
              c.setError({ code: p.code, message: p.message });
              const { text: m, metadata: v } = ht(p);
              c.addMessage("system", m, v);
            }
          },
          /** Phase 4: zero-query explain from a UI anchor. No user bubble — the
           *  assistant opens with context-aware help as the first message. */
          sendAnchorExplain: async (s, o) => {
            const u = s ? { id: s.anchorId, title: s.anchorTitle, initialQuery: s.initialQuery } : null;
            if (!u || !u.id || a().ui.loading) return;
            const { actions: l } = a(), c = a().session.id, f = a().user?.userId || o || we().userId;
            l.setAnchorContext(s), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await be.sendMessage(c, f, null, { anchor: u, lang: rt(), userContext: a().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), l.applyTurnResult(h);
            } catch (h) {
              const d = h instanceof J ? h : new J("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          /** Send a structured confirm-or-choose selection (F9.1f). */
          sendChoice: async (s, o, u) => {
            if (a().ui.loading) return;
            const { actions: l } = a(), c = a().session.id, f = a().user?.userId || u || we().userId;
            l.addMessage("user", o || s.value || ue.t("choice.yes")), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await be.sendMessage(c, f, null, { choice: s, lang: rt(), userContext: a().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), h.draft && l.updateDraft(h.draft), l.applyTurnResult(h);
              const d = h?.state?.serviceId;
              if (d && a().schema?.serviceId !== d)
                try {
                  const p = await be.getSchema(d);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (h) {
              const d = h instanceof J ? h : new J("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
          sendControlAction: async (s, o, u) => {
            if (a().ui.loading) return;
            const { actions: l } = a(), c = a().session.id, f = a().user?.userId || u || we().userId;
            l.addMessage("user", o || s.value || ue.t("choice.yes")), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await be.sendMessage(c, f, null, { controlAction: s, lang: rt(), userContext: a().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), h.draft && l.updateDraft(h.draft), l.applyTurnResult(h);
              const d = h?.state?.serviceId;
              if (d && a().schema?.serviceId !== d)
                try {
                  const p = await be.getSchema(d);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (h) {
              const d = h instanceof J ? h : new J("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          // P1 — a system signal from the host, not something the user typed. The form
          // reporting a created request is the case today: the assistant closes the draft
          // and offers what to do next. No user bubble is added — nothing was said.
          notifyFormEvent: async (s, o) => {
            if (!s || a().ui.loading) return;
            const { actions: u } = a(), l = a().session.id, c = a().user?.userId || o || we().userId;
            i((f) => ({ ui: { ...f.ui, loading: !0, error: null, currentNode: null } })), n(l, u.setCurrentNode, () => u.setCurrentNode(null));
            try {
              const f = await be.sendMessage(l, c, null, { formEvent: s, lang: rt(), userContext: a().user || void 0 });
              u.addMessage("assistant", f.response, pt(f)), f.draft && u.updateDraft(f.draft), u.applyTurnResult(f);
            } catch (f) {
              const h = f instanceof J ? f : new J("SERVER", f.message);
              u.setError({ code: h.code, message: h.message });
              const { text: d, metadata: p } = ht(h);
              u.addMessage("system", d, p);
            } finally {
              i((f) => ({ ui: { ...f.ui, loading: !1 } }));
            }
          },
          startSession: (s = null) => {
            r(), i(() => ({
              session: { ...un(), serviceId: s },
              messages: [],
              attachments: [],
              draft: tt(),
              schema: null,
              ui: cn()
            })), a().actions.seedGreeting();
          },
          resetSession: () => {
            r(), i(() => ({
              session: un(),
              messages: [],
              draft: tt(),
              schema: null,
              ui: cn(),
              anchorContext: null
            })), a().actions.seedGreeting();
          },
          /**
           * Addition 4 — the request has been created (the Altiora wizard was submitted
           * after a hand-off): post a closing "glad to help" message and end assisted
           * composition. The draft/service is cleared and the composer is locked; a new
           * request begins a fresh session on the next load. Idempotent within a session.
           */
          completeWithThanks: (s = null) => {
            a().ui.completed || (a().actions.addMessage("assistant", ue.t("thanks"), { responseType: "thanks", ...s ? { srNumber: s } : {} }), i((o) => ({
              session: { ...o.session, serviceId: null, status: "submitted" },
              draft: tt(),
              ui: { ...o.ui, loading: !1, currentNode: null, completed: !0, composerDisabled: !0 }
            })));
          },
          /**
           * Adopt an externally-owned session id (Phase V1.1) so this chat shares ONE
           * backend session with another surface — e.g. the portal voice launcher
           * makes its text window and its voice channel the SAME assistant session
           * (shared DraftSR + history + server-side turn context). Idempotent; a
           * no-op when the id already matches. Keeps the current thread (messages are
           * mount-fresh, so there is nothing to lose) and re-points progress.
           */
          adoptSession: (s) => {
            !s || a().session.id === s || (r(), i((o) => ({ session: { ...o.session, id: s } })));
          },
          /**
           * VF1-004: append a VOICE-originated turn to the thread — no API call, no
           * controls, just the spoken line rendered as text (voice+text are one
           * session). Deduped against the immediately-preceding message so a live
           * push can't double a turn.
           */
          addVoiceTranscript: ({ role: s, content: o, timestamp: u } = {}) => {
            if (!o || s !== "user" && s !== "assistant") return;
            const l = a().messages, c = l[l.length - 1];
            if (c && c.role === s && c.content === o) return;
            const f = { source: "voice", ...u ? { clientTimestamp: u } : {} };
            i((h) => ({ messages: [...h.messages, ln(s, o, f)] }));
          },
          /**
           * VF1-005: merge a server-persisted voice transcript into the thread,
           * skipping turns already present (dedup by role+content) so hydration on
           * open never duplicates lines the live bridge already pushed.
           */
          hydrateTranscripts: (s) => {
            !Array.isArray(s) || s.length === 0 || i((o) => {
              const u = new Set(o.messages.map((c) => `${c.role}\0${c.content}`)), l = [];
              for (const c of s) {
                if (!c || c.role !== "user" && c.role !== "assistant" || !c.content) continue;
                const f = `${c.role}\0${c.content}`;
                u.has(f) || (u.add(f), l.push(ln(c.role, c.content, { source: c.metadata && c.metadata.source || "voice" })));
              }
              return l.length ? { messages: [...o.messages, ...l] } : {};
            });
          },
          /** VF1-005: fetch this session's persisted voice transcript and hydrate it. */
          loadVoiceHistory: async () => {
            const s = a().session.id;
            try {
              const o = await be.getVoiceTranscript(s);
              a().actions.hydrateTranscripts(o);
            } catch {
            }
          },
          /** Merge a server turn result into session + draft. */
          applyTurnResult: (s) => {
            i((u) => ({
              session: {
                ...u.session,
                serviceId: s?.state?.serviceId ?? u.session.serviceId,
                status: s?.state?.status ?? (s?.isComplete ? "submitted" : "active")
              },
              ui: { ...u.ui, loading: !1, currentNode: null }
            }));
            const o = s?.spawnResult?.requestId || s?.state?.srNumber || null;
            if (o) {
              const u = s?.spawnResult?.ticketId || s?.state?.ticketId || o;
              a().actions.linkAttachments(u), Gr("onSubmitted", { srNumber: o, sessionId: a().session.id, serviceId: a().session.serviceId, result: s });
            }
          },
          updateDraft: (s) => i(() => ({ draft: { ...tt(), ...s || {} } })),
          /** Inline slot edit from the DraftPanel: optimistic → patchDraft → reconcile. */
          patchSlot: async (s, o) => {
            const u = a().session.id, l = a().draft;
            i((c) => ({ draft: { ...c.draft, slots: { ...c.draft.slots, [s]: { ...c.draft.slots[s] || {}, value: o, provenance: "user_edited", stale: !1 } } } }));
            try {
              const c = await be.patchDraft(u, [{ op: "set", slotId: s, value: o, provenance: "user_edited" }]);
              c && c.slots && i(() => ({ draft: { ...tt(), ...c } }));
            } catch (c) {
              i(() => ({ draft: l })), a().actions.setError({ code: c.code || "SERVER", message: c.message });
            }
          },
          /** Phase 3: remember the UI anchor the chat was opened from (floating window). */
          setAnchorContext: (s) => i(() => ({ anchorContext: s || null })),
          setCurrentNode: (s) => i((o) => ({ ui: { ...o.ui, currentNode: s } })),
          setLoading: (s) => i((o) => ({ ui: { ...o.ui, loading: s } })),
          setError: (s) => {
            i((o) => ({ ui: { ...o.ui, error: s, loading: !1, currentNode: null } })), Gr("onError", s);
          },
          clearError: () => i((s) => ({ ui: { ...s.ui, error: null } })),
          toggleDraftPanel: () => i((s) => ({ ui: { ...s.ui, draftPanelOpen: !s.ui.draftPanelOpen } }))
        }
      }),
      {
        // Store-scoped key: each storeId keeps its OWN session id (the 'assistant'
        // window and the Home 'default' chat must not clobber each other's thread).
        name: e === "default" ? "fdv2-chat" : `fdv2-chat-${e}`,
        storage: ta(() => sessionStorage),
        // A fresh chat every load: the session id is intentionally NOT persisted, so a
        // page (re)load always begins a NEW chat session rather than resuming a stale
        // thread. In-tab interactions keep the same in-memory session (the store is a
        // singleton); only a full reload starts anew. Messages are never persisted.
        partialize: () => ({}),
        merge: (i, a) => ({ ...a })
      }
    )
  );
}
const fn = /* @__PURE__ */ new Map();
function ia(e = "default") {
  return fn.has(e) || fn.set(e, zo(e)), fn.get(e);
}
const aa = ia("default"), sa = Jn(null);
function jo({ storeId: e = "default", children: t }) {
  const n = xt(() => ia(e), [e]);
  return Ui(sa.Provider, { value: n }, t);
}
function Ye() {
  return Yn(sa) || aa;
}
const oa = () => Ye()((e) => e.messages), la = () => Ye()(Xn((e) => e.session)), $o = () => Ye()(Xn((e) => e.draft)), Bo = () => Ye()((e) => e.schema), Ce = () => Ye()(Xn((e) => e.ui)), _e = () => Ye()((e) => e.actions), Qt = "fdv2-ai-prefs", Mn = "fdv2:aiPrefsChanged", dn = { language: "en", voice: null };
function Vo() {
  try {
    return typeof localStorage < "u" && localStorage.getItem(Qt) != null;
  } catch {
    return !1;
  }
}
function $t() {
  try {
    const e = typeof localStorage < "u" ? localStorage.getItem(Qt) : null;
    return e ? { ...dn, ...JSON.parse(e) } : { ...dn };
  } catch {
    return { ...dn };
  }
}
function ua(e) {
  const t = { ...$t(), ...e || {} };
  try {
    localStorage.setItem(Qt, JSON.stringify(t));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent(Mn, { detail: t }));
  } catch {
  }
  return t;
}
function er() {
  const [e, t] = ne($t);
  te(() => {
    const r = (a) => t(a.detail || $t()), i = (a) => {
      a.key === Qt && t($t());
    };
    return window.addEventListener(Mn, r), window.addEventListener("storage", i), () => {
      window.removeEventListener(Mn, r), window.removeEventListener("storage", i);
    };
  }, []);
  const n = Se((r) => ua(r), []);
  return [e, n];
}
function Ho(e, t) {
  const n = {};
  return (e[e.length - 1] === "" ? [...e, ""] : e).join(
    (n.padRight ? " " : "") + "," + (n.padLeft === !1 ? "" : " ")
  ).trim();
}
const Uo = /^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, qo = /^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, Ko = {};
function Yr(e, t) {
  return (Ko.jsx ? qo : Uo).test(e);
}
const Wo = /[ \t\n\f\r]/g;
function Go(e) {
  return typeof e == "object" ? e.type === "text" ? Qr(e.value) : !1 : Qr(e);
}
function Qr(e) {
  return e.replace(Wo, "") === "";
}
class Tt {
  /**
   * @param {SchemaType['property']} property
   *   Property.
   * @param {SchemaType['normal']} normal
   *   Normal.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Schema.
   */
  constructor(t, n, r) {
    this.normal = n, this.property = t, r && (this.space = r);
  }
}
Tt.prototype.normal = {};
Tt.prototype.property = {};
Tt.prototype.space = void 0;
function ca(e, t) {
  const n = {}, r = {};
  for (const i of e)
    Object.assign(n, i.property), Object.assign(r, i.normal);
  return new Tt(n, r, t);
}
function zn(e) {
  return e.toLowerCase();
}
class me {
  /**
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @returns
   *   Info.
   */
  constructor(t, n) {
    this.attribute = n, this.property = t;
  }
}
me.prototype.attribute = "";
me.prototype.booleanish = !1;
me.prototype.boolean = !1;
me.prototype.commaOrSpaceSeparated = !1;
me.prototype.commaSeparated = !1;
me.prototype.defined = !1;
me.prototype.mustUseProperty = !1;
me.prototype.number = !1;
me.prototype.overloadedBoolean = !1;
me.prototype.property = "";
me.prototype.spaceSeparated = !1;
me.prototype.space = void 0;
let Jo = 0;
const V = Qe(), re = Qe(), jn = Qe(), L = Qe(), X = Qe(), Ke = Qe(), xe = Qe();
function Qe() {
  return 2 ** ++Jo;
}
const $n = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: V,
  booleanish: re,
  commaOrSpaceSeparated: xe,
  commaSeparated: Ke,
  number: L,
  overloadedBoolean: jn,
  spaceSeparated: X
}, Symbol.toStringTag, { value: "Module" })), hn = (
  /** @type {ReadonlyArray<keyof typeof types>} */
  Object.keys($n)
);
class tr extends me {
  /**
   * @constructor
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @param {number | null | undefined} [mask]
   *   Mask.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Info.
   */
  constructor(t, n, r, i) {
    let a = -1;
    if (super(t, n), Xr(this, "space", i), typeof r == "number")
      for (; ++a < hn.length; ) {
        const s = hn[a];
        Xr(this, hn[a], (r & $n[s]) === $n[s]);
      }
  }
}
tr.prototype.defined = !0;
function Xr(e, t, n) {
  n && (e[t] = n);
}
function ot(e) {
  const t = {}, n = {};
  for (const [r, i] of Object.entries(e.properties)) {
    const a = new tr(
      r,
      e.transform(e.attributes || {}, r),
      i,
      e.space
    );
    e.mustUseProperty && e.mustUseProperty.includes(r) && (a.mustUseProperty = !0), t[r] = a, n[zn(r)] = r, n[zn(a.attribute)] = r;
  }
  return new Tt(t, n, e.space);
}
const fa = ot({
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: re,
    ariaAutoComplete: null,
    ariaBusy: re,
    ariaChecked: re,
    ariaColCount: L,
    ariaColIndex: L,
    ariaColSpan: L,
    ariaControls: X,
    ariaCurrent: null,
    ariaDescribedBy: X,
    ariaDetails: null,
    ariaDisabled: re,
    ariaDropEffect: X,
    ariaErrorMessage: null,
    ariaExpanded: re,
    ariaFlowTo: X,
    ariaGrabbed: re,
    ariaHasPopup: null,
    ariaHidden: re,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: X,
    ariaLevel: L,
    ariaLive: null,
    ariaModal: re,
    ariaMultiLine: re,
    ariaMultiSelectable: re,
    ariaOrientation: null,
    ariaOwns: X,
    ariaPlaceholder: null,
    ariaPosInSet: L,
    ariaPressed: re,
    ariaReadOnly: re,
    ariaRelevant: null,
    ariaRequired: re,
    ariaRoleDescription: X,
    ariaRowCount: L,
    ariaRowIndex: L,
    ariaRowSpan: L,
    ariaSelected: re,
    ariaSetSize: L,
    ariaSort: null,
    ariaValueMax: L,
    ariaValueMin: L,
    ariaValueNow: L,
    ariaValueText: null,
    role: null
  },
  transform(e, t) {
    return t === "role" ? t : "aria-" + t.slice(4).toLowerCase();
  }
});
function da(e, t) {
  return t in e ? e[t] : t;
}
function ha(e, t) {
  return da(e, t.toLowerCase());
}
const Yo = ot({
  attributes: {
    acceptcharset: "accept-charset",
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv"
  },
  mustUseProperty: ["checked", "multiple", "muted", "selected"],
  properties: {
    // Standard Properties.
    abbr: null,
    accept: Ke,
    acceptCharset: X,
    accessKey: X,
    action: null,
    allow: null,
    allowFullScreen: V,
    allowPaymentRequest: V,
    allowUserMedia: V,
    alpha: V,
    alt: null,
    as: null,
    async: V,
    autoCapitalize: null,
    autoComplete: X,
    autoFocus: V,
    autoPlay: V,
    blocking: X,
    capture: null,
    charSet: null,
    checked: V,
    cite: null,
    className: X,
    closedBy: null,
    colorSpace: null,
    cols: L,
    colSpan: L,
    command: null,
    commandFor: null,
    content: null,
    contentEditable: re,
    controls: V,
    controlsList: X,
    coords: L | Ke,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: V,
    defer: V,
    dir: null,
    dirName: null,
    disabled: V,
    download: jn,
    draggable: re,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: V,
    formTarget: null,
    headers: X,
    height: L,
    hidden: jn,
    high: L,
    href: null,
    hrefLang: null,
    htmlFor: X,
    httpEquiv: X,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: V,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: V,
    itemId: null,
    itemProp: X,
    itemRef: X,
    itemScope: V,
    itemType: X,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: V,
    low: L,
    manifest: null,
    max: null,
    maxLength: L,
    media: null,
    method: null,
    min: null,
    minLength: L,
    multiple: V,
    muted: V,
    name: null,
    nonce: null,
    noModule: V,
    noValidate: V,
    onAbort: null,
    onAfterPrint: null,
    onAuxClick: null,
    onBeforeMatch: null,
    onBeforePrint: null,
    onBeforeToggle: null,
    onBeforeUnload: null,
    onBlur: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onContextLost: null,
    onContextMenu: null,
    onContextRestored: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFormData: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLanguageChange: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadEnd: null,
    onLoadStart: null,
    onMessage: null,
    onMessageError: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRejectionHandled: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onScrollEnd: null,
    onSecurityPolicyViolation: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onSlotChange: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnhandledRejection: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onWheel: null,
    open: V,
    optimum: L,
    pattern: null,
    ping: X,
    placeholder: null,
    playsInline: V,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: V,
    referrerPolicy: null,
    rel: X,
    required: V,
    reversed: V,
    rows: L,
    rowSpan: L,
    sandbox: X,
    scope: null,
    scoped: V,
    seamless: V,
    selected: V,
    shadowRootClonable: V,
    shadowRootCustomElementRegistry: V,
    shadowRootDelegatesFocus: V,
    shadowRootMode: null,
    shadowRootSerializable: V,
    shape: null,
    size: L,
    sizes: null,
    slot: null,
    span: L,
    spellCheck: re,
    src: null,
    srcDoc: null,
    srcLang: null,
    srcSet: null,
    start: L,
    step: null,
    style: null,
    tabIndex: L,
    target: null,
    title: null,
    translate: null,
    type: null,
    typeMustMatch: V,
    useMap: null,
    value: re,
    width: L,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: X,
    // `<object>`. List of URIs to archives
    axis: null,
    // `<td>` and `<th>`. Use `scope` on `<th>`
    background: null,
    // `<body>`. Use CSS `background-image` instead
    bgColor: null,
    // `<body>` and table elements. Use CSS `background-color` instead
    border: L,
    // `<table>`. Use CSS `border-width` instead,
    borderColor: null,
    // `<table>`. Use CSS `border-color` instead,
    bottomMargin: L,
    // `<body>`
    cellPadding: null,
    // `<table>`
    cellSpacing: null,
    // `<table>`
    char: null,
    // Several table elements. When `align=char`, sets the character to align on
    charOff: null,
    // Several table elements. When `char`, offsets the alignment
    classId: null,
    // `<object>`
    clear: null,
    // `<br>`. Use CSS `clear` instead
    code: null,
    // `<object>`
    codeBase: null,
    // `<object>`
    codeType: null,
    // `<object>`
    color: null,
    // `<font>` and `<hr>`. Use CSS instead
    compact: V,
    // Lists. Use CSS to reduce space between items instead
    declare: V,
    // `<object>`
    event: null,
    // `<script>`
    face: null,
    // `<font>`. Use CSS instead
    frame: null,
    // `<table>`
    frameBorder: null,
    // `<iframe>`. Use CSS `border` instead
    hSpace: L,
    // `<img>` and `<object>`
    leftMargin: L,
    // `<body>`
    link: null,
    // `<body>`. Use CSS `a:link {color: *}` instead
    longDesc: null,
    // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
    lowSrc: null,
    // `<img>`. Use a `<picture>`
    marginHeight: L,
    // `<body>`
    marginWidth: L,
    // `<body>`
    noResize: V,
    // `<frame>`
    noHref: V,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: V,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: V,
    // `<td>` and `<th>`
    object: null,
    // `<applet>`
    profile: null,
    // `<head>`
    prompt: null,
    // `<isindex>`
    rev: null,
    // `<link>`
    rightMargin: L,
    // `<body>`
    rules: null,
    // `<table>`
    scheme: null,
    // `<meta>`
    scrolling: re,
    // `<frame>`. Use overflow in the child context
    standby: null,
    // `<object>`
    summary: null,
    // `<table>`
    text: null,
    // `<body>`. Use CSS `color` instead
    topMargin: L,
    // `<body>`
    valueType: null,
    // `<param>`
    version: null,
    // `<html>`. Use a doctype.
    vAlign: null,
    // Several. Use CSS `vertical-align` instead
    vLink: null,
    // `<body>`. Use CSS `a:visited {color}` instead
    vSpace: L,
    // `<img>` and `<object>`
    // Non-standard Properties.
    allowTransparency: null,
    autoCorrect: null,
    autoSave: null,
    credentialless: V,
    disablePictureInPicture: V,
    disableRemotePlayback: V,
    exportParts: Ke,
    part: X,
    prefix: null,
    property: null,
    results: L,
    security: null,
    unselectable: null
  },
  space: "html",
  transform: ha
}), Qo = ot({
  attributes: {
    accentHeight: "accent-height",
    alignmentBaseline: "alignment-baseline",
    arabicForm: "arabic-form",
    baselineShift: "baseline-shift",
    capHeight: "cap-height",
    className: "class",
    clipPath: "clip-path",
    clipRule: "clip-rule",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    colorProfile: "color-profile",
    colorRendering: "color-rendering",
    crossOrigin: "crossorigin",
    dataType: "datatype",
    dominantBaseline: "dominant-baseline",
    enableBackground: "enable-background",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    floodColor: "flood-color",
    floodOpacity: "flood-opacity",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontSizeAdjust: "font-size-adjust",
    fontStretch: "font-stretch",
    fontStyle: "font-style",
    fontVariant: "font-variant",
    fontWeight: "font-weight",
    glyphName: "glyph-name",
    glyphOrientationHorizontal: "glyph-orientation-horizontal",
    glyphOrientationVertical: "glyph-orientation-vertical",
    hrefLang: "hreflang",
    horizAdvX: "horiz-adv-x",
    horizOriginX: "horiz-origin-x",
    horizOriginY: "horiz-origin-y",
    imageRendering: "image-rendering",
    letterSpacing: "letter-spacing",
    lightingColor: "lighting-color",
    markerEnd: "marker-end",
    markerMid: "marker-mid",
    markerStart: "marker-start",
    maskType: "mask-type",
    navDown: "nav-down",
    navDownLeft: "nav-down-left",
    navDownRight: "nav-down-right",
    navLeft: "nav-left",
    navNext: "nav-next",
    navPrev: "nav-prev",
    navRight: "nav-right",
    navUp: "nav-up",
    navUpLeft: "nav-up-left",
    navUpRight: "nav-up-right",
    onAbort: "onabort",
    onActivate: "onactivate",
    onAfterPrint: "onafterprint",
    onBeforePrint: "onbeforeprint",
    onBegin: "onbegin",
    onCancel: "oncancel",
    onCanPlay: "oncanplay",
    onCanPlayThrough: "oncanplaythrough",
    onChange: "onchange",
    onClick: "onclick",
    onClose: "onclose",
    onCopy: "oncopy",
    onCueChange: "oncuechange",
    onCut: "oncut",
    onDblClick: "ondblclick",
    onDrag: "ondrag",
    onDragEnd: "ondragend",
    onDragEnter: "ondragenter",
    onDragExit: "ondragexit",
    onDragLeave: "ondragleave",
    onDragOver: "ondragover",
    onDragStart: "ondragstart",
    onDrop: "ondrop",
    onDurationChange: "ondurationchange",
    onEmptied: "onemptied",
    onEnd: "onend",
    onEnded: "onended",
    onError: "onerror",
    onFocus: "onfocus",
    onFocusIn: "onfocusin",
    onFocusOut: "onfocusout",
    onHashChange: "onhashchange",
    onInput: "oninput",
    onInvalid: "oninvalid",
    onKeyDown: "onkeydown",
    onKeyPress: "onkeypress",
    onKeyUp: "onkeyup",
    onLoad: "onload",
    onLoadedData: "onloadeddata",
    onLoadedMetadata: "onloadedmetadata",
    onLoadStart: "onloadstart",
    onMessage: "onmessage",
    onMouseDown: "onmousedown",
    onMouseEnter: "onmouseenter",
    onMouseLeave: "onmouseleave",
    onMouseMove: "onmousemove",
    onMouseOut: "onmouseout",
    onMouseOver: "onmouseover",
    onMouseUp: "onmouseup",
    onMouseWheel: "onmousewheel",
    onOffline: "onoffline",
    onOnline: "ononline",
    onPageHide: "onpagehide",
    onPageShow: "onpageshow",
    onPaste: "onpaste",
    onPause: "onpause",
    onPlay: "onplay",
    onPlaying: "onplaying",
    onPopState: "onpopstate",
    onProgress: "onprogress",
    onRateChange: "onratechange",
    onRepeat: "onrepeat",
    onReset: "onreset",
    onResize: "onresize",
    onScroll: "onscroll",
    onSeeked: "onseeked",
    onSeeking: "onseeking",
    onSelect: "onselect",
    onShow: "onshow",
    onStalled: "onstalled",
    onStorage: "onstorage",
    onSubmit: "onsubmit",
    onSuspend: "onsuspend",
    onTimeUpdate: "ontimeupdate",
    onToggle: "ontoggle",
    onUnload: "onunload",
    onVolumeChange: "onvolumechange",
    onWaiting: "onwaiting",
    onZoom: "onzoom",
    overlinePosition: "overline-position",
    overlineThickness: "overline-thickness",
    paintOrder: "paint-order",
    panose1: "panose-1",
    pointerEvents: "pointer-events",
    referrerPolicy: "referrerpolicy",
    renderingIntent: "rendering-intent",
    shapeRendering: "shape-rendering",
    stopColor: "stop-color",
    stopOpacity: "stop-opacity",
    strikethroughPosition: "strikethrough-position",
    strikethroughThickness: "strikethrough-thickness",
    strokeDashArray: "stroke-dasharray",
    strokeDashOffset: "stroke-dashoffset",
    strokeLineCap: "stroke-linecap",
    strokeLineJoin: "stroke-linejoin",
    strokeMiterLimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    strokeWidth: "stroke-width",
    tabIndex: "tabindex",
    textAnchor: "text-anchor",
    textDecoration: "text-decoration",
    textRendering: "text-rendering",
    transformOrigin: "transform-origin",
    typeOf: "typeof",
    underlinePosition: "underline-position",
    underlineThickness: "underline-thickness",
    unicodeBidi: "unicode-bidi",
    unicodeRange: "unicode-range",
    unitsPerEm: "units-per-em",
    vAlphabetic: "v-alphabetic",
    vHanging: "v-hanging",
    vIdeographic: "v-ideographic",
    vMathematical: "v-mathematical",
    vectorEffect: "vector-effect",
    vertAdvY: "vert-adv-y",
    vertOriginX: "vert-origin-x",
    vertOriginY: "vert-origin-y",
    wordSpacing: "word-spacing",
    writingMode: "writing-mode",
    xHeight: "x-height",
    // These were camelcased in Tiny. Now lowercased in SVG 2
    playbackOrder: "playbackorder",
    timelineBegin: "timelinebegin"
  },
  properties: {
    about: xe,
    accentHeight: L,
    accumulate: null,
    additive: null,
    alignmentBaseline: null,
    alphabetic: L,
    amplitude: L,
    arabicForm: null,
    ascent: L,
    attributeName: null,
    attributeType: null,
    azimuth: L,
    bandwidth: null,
    baselineShift: null,
    baseFrequency: null,
    baseProfile: null,
    bbox: null,
    begin: null,
    bias: L,
    by: null,
    calcMode: null,
    capHeight: L,
    className: X,
    clip: null,
    clipPath: null,
    clipPathUnits: null,
    clipRule: null,
    color: null,
    colorInterpolation: null,
    colorInterpolationFilters: null,
    colorProfile: null,
    colorRendering: null,
    content: null,
    contentScriptType: null,
    contentStyleType: null,
    crossOrigin: null,
    cursor: null,
    cx: null,
    cy: null,
    d: null,
    dataType: null,
    defaultAction: null,
    descent: L,
    diffuseConstant: L,
    direction: null,
    display: null,
    dur: null,
    divisor: L,
    dominantBaseline: null,
    download: V,
    dx: null,
    dy: null,
    edgeMode: null,
    editable: null,
    elevation: L,
    enableBackground: null,
    end: null,
    event: null,
    exponent: L,
    externalResourcesRequired: null,
    fill: null,
    fillOpacity: L,
    fillRule: null,
    filter: null,
    filterRes: null,
    filterUnits: null,
    floodColor: null,
    floodOpacity: null,
    focusable: null,
    focusHighlight: null,
    fontFamily: null,
    fontSize: null,
    fontSizeAdjust: null,
    fontStretch: null,
    fontStyle: null,
    fontVariant: null,
    fontWeight: null,
    format: null,
    fr: null,
    from: null,
    fx: null,
    fy: null,
    g1: Ke,
    g2: Ke,
    glyphName: Ke,
    glyphOrientationHorizontal: null,
    glyphOrientationVertical: null,
    glyphRef: null,
    gradientTransform: null,
    gradientUnits: null,
    handler: null,
    hanging: L,
    hatchContentUnits: null,
    hatchUnits: null,
    height: null,
    href: null,
    hrefLang: null,
    horizAdvX: L,
    horizOriginX: L,
    horizOriginY: L,
    id: null,
    ideographic: L,
    imageRendering: null,
    initialVisibility: null,
    in: null,
    in2: null,
    intercept: L,
    k: L,
    k1: L,
    k2: L,
    k3: L,
    k4: L,
    kernelMatrix: xe,
    kernelUnitLength: null,
    keyPoints: null,
    // SEMI_COLON_SEPARATED
    keySplines: null,
    // SEMI_COLON_SEPARATED
    keyTimes: null,
    // SEMI_COLON_SEPARATED
    kerning: null,
    lang: null,
    lengthAdjust: null,
    letterSpacing: null,
    lightingColor: null,
    limitingConeAngle: L,
    local: null,
    markerEnd: null,
    markerMid: null,
    markerStart: null,
    markerHeight: null,
    markerUnits: null,
    markerWidth: null,
    mask: null,
    maskContentUnits: null,
    maskType: null,
    maskUnits: null,
    mathematical: null,
    max: null,
    media: null,
    mediaCharacterEncoding: null,
    mediaContentEncodings: null,
    mediaSize: L,
    mediaTime: null,
    method: null,
    min: null,
    mode: null,
    name: null,
    navDown: null,
    navDownLeft: null,
    navDownRight: null,
    navLeft: null,
    navNext: null,
    navPrev: null,
    navRight: null,
    navUp: null,
    navUpLeft: null,
    navUpRight: null,
    numOctaves: null,
    observer: null,
    offset: null,
    onAbort: null,
    onActivate: null,
    onAfterPrint: null,
    onBeforePrint: null,
    onBegin: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnd: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFocusIn: null,
    onFocusOut: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadStart: null,
    onMessage: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onMouseWheel: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRepeat: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onShow: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onZoom: null,
    opacity: null,
    operator: null,
    order: null,
    orient: null,
    orientation: null,
    origin: null,
    overflow: null,
    overlay: null,
    overlinePosition: L,
    overlineThickness: L,
    paintOrder: null,
    panose1: null,
    path: null,
    pathLength: L,
    patternContentUnits: null,
    patternTransform: null,
    patternUnits: null,
    phase: null,
    ping: X,
    pitch: null,
    playbackOrder: null,
    pointerEvents: null,
    points: null,
    pointsAtX: L,
    pointsAtY: L,
    pointsAtZ: L,
    preserveAlpha: null,
    preserveAspectRatio: null,
    primitiveUnits: null,
    propagate: null,
    property: xe,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: xe,
    rev: xe,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: xe,
    requiredFeatures: xe,
    requiredFonts: xe,
    requiredFormats: xe,
    resource: null,
    restart: null,
    result: null,
    rotate: null,
    rx: null,
    ry: null,
    scale: null,
    seed: null,
    shapeRendering: null,
    side: null,
    slope: null,
    snapshotTime: null,
    specularConstant: L,
    specularExponent: L,
    spreadMethod: null,
    spacing: null,
    startOffset: null,
    stdDeviation: null,
    stemh: null,
    stemv: null,
    stitchTiles: null,
    stopColor: null,
    stopOpacity: null,
    strikethroughPosition: L,
    strikethroughThickness: L,
    string: null,
    stroke: null,
    strokeDashArray: xe,
    strokeDashOffset: null,
    strokeLineCap: null,
    strokeLineJoin: null,
    strokeMiterLimit: L,
    strokeOpacity: L,
    strokeWidth: null,
    style: null,
    surfaceScale: L,
    syncBehavior: null,
    syncBehaviorDefault: null,
    syncMaster: null,
    syncTolerance: null,
    syncToleranceDefault: null,
    systemLanguage: xe,
    tabIndex: L,
    tableValues: null,
    target: null,
    targetX: L,
    targetY: L,
    textAnchor: null,
    textDecoration: null,
    textRendering: null,
    textLength: null,
    timelineBegin: null,
    title: null,
    transformBehavior: null,
    type: null,
    typeOf: xe,
    to: null,
    transform: null,
    transformOrigin: null,
    u1: null,
    u2: null,
    underlinePosition: L,
    underlineThickness: L,
    unicode: null,
    unicodeBidi: null,
    unicodeRange: null,
    unitsPerEm: L,
    values: null,
    vAlphabetic: L,
    vMathematical: L,
    vectorEffect: null,
    vHanging: L,
    vIdeographic: L,
    version: null,
    vertAdvY: L,
    vertOriginX: L,
    vertOriginY: L,
    viewBox: null,
    viewTarget: null,
    visibility: null,
    width: null,
    widths: null,
    wordSpacing: null,
    writingMode: null,
    x: null,
    x1: null,
    x2: null,
    xChannelSelector: null,
    xHeight: L,
    y: null,
    y1: null,
    y2: null,
    yChannelSelector: null,
    z: null,
    zoomAndPan: null
  },
  space: "svg",
  transform: da
}), pa = ot({
  properties: {
    xLinkActuate: null,
    xLinkArcRole: null,
    xLinkHref: null,
    xLinkRole: null,
    xLinkShow: null,
    xLinkTitle: null,
    xLinkType: null
  },
  space: "xlink",
  transform(e, t) {
    return "xlink:" + t.slice(5).toLowerCase();
  }
}), ga = ot({
  attributes: { xmlnsxlink: "xmlns:xlink" },
  properties: { xmlnsXLink: null, xmlns: null },
  space: "xmlns",
  transform: ha
}), ma = ot({
  properties: { xmlBase: null, xmlLang: null, xmlSpace: null },
  space: "xml",
  transform(e, t) {
    return "xml:" + t.slice(3).toLowerCase();
  }
}), Xo = {
  classId: "classID",
  dataType: "datatype",
  itemId: "itemID",
  strokeDashArray: "strokeDasharray",
  strokeDashOffset: "strokeDashoffset",
  strokeLineCap: "strokeLinecap",
  strokeLineJoin: "strokeLinejoin",
  strokeMiterLimit: "strokeMiterlimit",
  typeOf: "typeof",
  xLinkActuate: "xlinkActuate",
  xLinkArcRole: "xlinkArcrole",
  xLinkHref: "xlinkHref",
  xLinkRole: "xlinkRole",
  xLinkShow: "xlinkShow",
  xLinkTitle: "xlinkTitle",
  xLinkType: "xlinkType",
  xmlnsXLink: "xmlnsXlink"
}, Zo = /[A-Z]/g, Zr = /-[a-z]/g, el = /^data[-\w.:]+$/i;
function tl(e, t) {
  const n = zn(t);
  let r = t, i = me;
  if (n in e.normal)
    return e.property[e.normal[n]];
  if (n.length > 4 && n.slice(0, 4) === "data" && el.test(t)) {
    if (t.charAt(4) === "-") {
      const a = t.slice(5).replace(Zr, rl);
      r = "data" + a.charAt(0).toUpperCase() + a.slice(1);
    } else {
      const a = t.slice(4);
      if (!Zr.test(a)) {
        let s = a.replace(Zo, nl);
        s.charAt(0) !== "-" && (s = "-" + s), t = "data" + s;
      }
    }
    i = tr;
  }
  return new i(r, t);
}
function nl(e) {
  return "-" + e.toLowerCase();
}
function rl(e) {
  return e.charAt(1).toUpperCase();
}
const il = ca([fa, Yo, pa, ga, ma], "html"), nr = ca([fa, Qo, pa, ga, ma], "svg");
function al(e) {
  return e.join(" ").trim();
}
var nt = {}, pn, ei;
function sl() {
  if (ei) return pn;
  ei = 1;
  var e = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, t = /\n/g, n = /^\s*/, r = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/, i = /^:\s*/, a = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/, s = /^[;\s]*/, o = /^\s+|\s+$/g, u = `
`, l = "/", c = "*", f = "", h = "comment", d = "declaration";
  function p(v, k) {
    if (typeof v != "string")
      throw new TypeError("First argument must be a string");
    if (!v) return [];
    k = k || {};
    var S = 1, C = 1;
    function N(_) {
      var O = _.match(t);
      O && (S += O.length);
      var B = _.lastIndexOf(u);
      C = ~B ? _.length - B : C + _.length;
    }
    function A() {
      var _ = { line: S, column: C };
      return function(O) {
        return O.position = new b(_), F(), O;
      };
    }
    function b(_) {
      this.start = _, this.end = { line: S, column: C }, this.source = k.source;
    }
    b.prototype.content = v;
    function I(_) {
      var O = new Error(
        k.source + ":" + S + ":" + C + ": " + _
      );
      if (O.reason = _, O.filename = k.source, O.line = S, O.column = C, O.source = v, !k.silent) throw O;
    }
    function M(_) {
      var O = _.exec(v);
      if (O) {
        var B = O[0];
        return N(B), v = v.slice(B.length), O;
      }
    }
    function F() {
      M(n);
    }
    function w(_) {
      var O;
      for (_ = _ || []; O = R(); )
        O !== !1 && _.push(O);
      return _;
    }
    function R() {
      var _ = A();
      if (!(l != v.charAt(0) || c != v.charAt(1))) {
        for (var O = 2; f != v.charAt(O) && (c != v.charAt(O) || l != v.charAt(O + 1)); )
          ++O;
        if (O += 2, f === v.charAt(O - 1))
          return I("End of comment missing");
        var B = v.slice(2, O - 2);
        return C += 2, N(B), v = v.slice(O), C += 2, _({
          type: h,
          comment: B
        });
      }
    }
    function D() {
      var _ = A(), O = M(r);
      if (O) {
        if (R(), !M(i)) return I("property missing ':'");
        var B = M(a), K = _({
          type: d,
          property: m(O[0].replace(e, f)),
          value: B ? m(B[0].replace(e, f)) : f
        });
        return M(s), K;
      }
    }
    function z() {
      var _ = [];
      w(_);
      for (var O; O = D(); )
        O !== !1 && (_.push(O), w(_));
      return _;
    }
    return F(), z();
  }
  function m(v) {
    return v ? v.replace(o, f) : f;
  }
  return pn = p, pn;
}
var ti;
function ol() {
  if (ti) return nt;
  ti = 1;
  var e = nt && nt.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(nt, "__esModule", { value: !0 }), nt.default = n;
  const t = e(sl());
  function n(r, i) {
    let a = null;
    if (!r || typeof r != "string")
      return a;
    const s = (0, t.default)(r), o = typeof i == "function";
    return s.forEach((u) => {
      if (u.type !== "declaration")
        return;
      const { property: l, value: c } = u;
      o ? i(l, c, u) : c && (a = a || {}, a[l] = c);
    }), a;
  }
  return nt;
}
var gt = {}, ni;
function ll() {
  if (ni) return gt;
  ni = 1, Object.defineProperty(gt, "__esModule", { value: !0 }), gt.camelCase = void 0;
  var e = /^--[a-zA-Z0-9_-]+$/, t = /-([a-z])/g, n = /^[^-]+$/, r = /^-(webkit|moz|ms|o|khtml)-/, i = /^-(ms)-/, a = function(l) {
    return !l || n.test(l) || e.test(l);
  }, s = function(l, c) {
    return c.toUpperCase();
  }, o = function(l, c) {
    return "".concat(c, "-");
  }, u = function(l, c) {
    return c === void 0 && (c = {}), a(l) ? l : (l = l.toLowerCase(), c.reactCompat ? l = l.replace(i, o) : l = l.replace(r, o), l.replace(t, s));
  };
  return gt.camelCase = u, gt;
}
var mt, ri;
function ul() {
  if (ri) return mt;
  ri = 1;
  var e = mt && mt.__importDefault || function(i) {
    return i && i.__esModule ? i : { default: i };
  }, t = e(ol()), n = ll();
  function r(i, a) {
    var s = {};
    return !i || typeof i != "string" || (0, t.default)(i, function(o, u) {
      o && u && (s[(0, n.camelCase)(o, a)] = u);
    }), s;
  }
  return r.default = r, mt = r, mt;
}
var cl = ul();
const fl = /* @__PURE__ */ Ji(cl), ya = ba("end"), rr = ba("start");
function ba(e) {
  return t;
  function t(n) {
    const r = n && n.position && n.position[e] || {};
    if (typeof r.line == "number" && r.line > 0 && typeof r.column == "number" && r.column > 0)
      return {
        line: r.line,
        column: r.column,
        offset: typeof r.offset == "number" && r.offset > -1 ? r.offset : void 0
      };
  }
}
function dl(e) {
  const t = rr(e), n = ya(e);
  if (t && n)
    return { start: t, end: n };
}
function wt(e) {
  return !e || typeof e != "object" ? "" : "position" in e || "type" in e ? ii(e.position) : "start" in e || "end" in e ? ii(e) : "line" in e || "column" in e ? Bn(e) : "";
}
function Bn(e) {
  return ai(e && e.line) + ":" + ai(e && e.column);
}
function ii(e) {
  return Bn(e && e.start) + "-" + Bn(e && e.end);
}
function ai(e) {
  return e && typeof e == "number" ? e : 1;
}
class fe extends Error {
  /**
   * Create a message for `reason`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {Options | null | undefined} [options]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | Options | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns
   *   Instance of `VFileMessage`.
   */
  // eslint-disable-next-line complexity
  constructor(t, n, r) {
    super(), typeof n == "string" && (r = n, n = void 0);
    let i = "", a = {}, s = !1;
    if (n && ("line" in n && "column" in n ? a = { place: n } : "start" in n && "end" in n ? a = { place: n } : "type" in n ? a = {
      ancestors: [n],
      place: n.position
    } : a = { ...n }), typeof t == "string" ? i = t : !a.cause && t && (s = !0, i = t.message, a.cause = t), !a.ruleId && !a.source && typeof r == "string") {
      const u = r.indexOf(":");
      u === -1 ? a.ruleId = r : (a.source = r.slice(0, u), a.ruleId = r.slice(u + 1));
    }
    if (!a.place && a.ancestors && a.ancestors) {
      const u = a.ancestors[a.ancestors.length - 1];
      u && (a.place = u.position);
    }
    const o = a.place && "start" in a.place ? a.place.start : a.place;
    this.ancestors = a.ancestors || void 0, this.cause = a.cause || void 0, this.column = o ? o.column : void 0, this.fatal = void 0, this.file = "", this.message = i, this.line = o ? o.line : void 0, this.name = wt(a.place) || "1:1", this.place = a.place || void 0, this.reason = this.message, this.ruleId = a.ruleId || void 0, this.source = a.source || void 0, this.stack = s && a.cause && typeof a.cause.stack == "string" ? a.cause.stack : "", this.actual = void 0, this.expected = void 0, this.note = void 0, this.url = void 0;
  }
}
fe.prototype.file = "";
fe.prototype.name = "";
fe.prototype.reason = "";
fe.prototype.message = "";
fe.prototype.stack = "";
fe.prototype.column = void 0;
fe.prototype.line = void 0;
fe.prototype.ancestors = void 0;
fe.prototype.cause = void 0;
fe.prototype.fatal = void 0;
fe.prototype.place = void 0;
fe.prototype.ruleId = void 0;
fe.prototype.source = void 0;
const ir = {}.hasOwnProperty, hl = /* @__PURE__ */ new Map(), pl = /[A-Z]/g, gl = /* @__PURE__ */ new Set(["table", "tbody", "thead", "tfoot", "tr"]), ml = /* @__PURE__ */ new Set(["td", "th"]), xa = "https://github.com/syntax-tree/hast-util-to-jsx-runtime";
function yl(e, t) {
  if (!t || t.Fragment === void 0)
    throw new TypeError("Expected `Fragment` in options");
  const n = t.filePath || void 0;
  let r;
  if (t.development) {
    if (typeof t.jsxDEV != "function")
      throw new TypeError(
        "Expected `jsxDEV` in options when `development: true`"
      );
    r = El(n, t.jsxDEV);
  } else {
    if (typeof t.jsx != "function")
      throw new TypeError("Expected `jsx` in production options");
    if (typeof t.jsxs != "function")
      throw new TypeError("Expected `jsxs` in production options");
    r = Cl(n, t.jsx, t.jsxs);
  }
  const i = {
    Fragment: t.Fragment,
    ancestors: [],
    components: t.components || {},
    create: r,
    elementAttributeNameCase: t.elementAttributeNameCase || "react",
    evaluater: t.createEvaluater ? t.createEvaluater() : void 0,
    filePath: n,
    ignoreInvalidStyle: t.ignoreInvalidStyle || !1,
    passKeys: t.passKeys !== !1,
    passNode: t.passNode || !1,
    schema: t.space === "svg" ? nr : il,
    stylePropertyNameCase: t.stylePropertyNameCase || "dom",
    tableCellAlignToStyle: t.tableCellAlignToStyle !== !1
  }, a = ka(i, e, void 0);
  return a && typeof a != "string" ? a : i.create(
    e,
    i.Fragment,
    { children: a || void 0 },
    void 0
  );
}
function ka(e, t, n) {
  if (t.type === "element")
    return bl(e, t, n);
  if (t.type === "mdxFlowExpression" || t.type === "mdxTextExpression")
    return xl(e, t);
  if (t.type === "mdxJsxFlowElement" || t.type === "mdxJsxTextElement")
    return vl(e, t, n);
  if (t.type === "mdxjsEsm")
    return kl(e, t);
  if (t.type === "root")
    return wl(e, t, n);
  if (t.type === "text")
    return Sl(e, t);
}
function bl(e, t, n) {
  const r = e.schema;
  let i = r;
  t.tagName.toLowerCase() === "svg" && r.space === "html" && (i = nr, e.schema = i), e.ancestors.push(t);
  const a = wa(e, t.tagName, !1), s = Nl(e, t);
  let o = sr(e, t);
  return gl.has(t.tagName) && (o = o.filter(function(u) {
    return typeof u == "string" ? !Go(u) : !0;
  })), va(e, s, a, t), ar(s, o), e.ancestors.pop(), e.schema = r, e.create(t, a, s, n);
}
function xl(e, t) {
  if (t.data && t.data.estree && e.evaluater) {
    const r = t.data.estree.body[0];
    return r.type, /** @type {Child | undefined} */
    e.evaluater.evaluateExpression(r.expression);
  }
  Nt(e, t.position);
}
function kl(e, t) {
  if (t.data && t.data.estree && e.evaluater)
    return (
      /** @type {Child | undefined} */
      e.evaluater.evaluateProgram(t.data.estree)
    );
  Nt(e, t.position);
}
function vl(e, t, n) {
  const r = e.schema;
  let i = r;
  t.name === "svg" && r.space === "html" && (i = nr, e.schema = i), e.ancestors.push(t);
  const a = t.name === null ? e.Fragment : wa(e, t.name, !0), s = Il(e, t), o = sr(e, t);
  return va(e, s, a, t), ar(s, o), e.ancestors.pop(), e.schema = r, e.create(t, a, s, n);
}
function wl(e, t, n) {
  const r = {};
  return ar(r, sr(e, t)), e.create(t, e.Fragment, r, n);
}
function Sl(e, t) {
  return t.value;
}
function va(e, t, n, r) {
  typeof n != "string" && n !== e.Fragment && e.passNode && (t.node = r);
}
function ar(e, t) {
  if (t.length > 0) {
    const n = t.length > 1 ? t : t[0];
    n && (e.children = n);
  }
}
function Cl(e, t, n) {
  return r;
  function r(i, a, s, o) {
    const l = Array.isArray(s.children) ? n : t;
    return o ? l(a, s, o) : l(a, s);
  }
}
function El(e, t) {
  return n;
  function n(r, i, a, s) {
    const o = Array.isArray(a.children), u = rr(r);
    return t(
      i,
      a,
      s,
      o,
      {
        columnNumber: u ? u.column - 1 : void 0,
        fileName: e,
        lineNumber: u ? u.line : void 0
      },
      void 0
    );
  }
}
function Nl(e, t) {
  const n = {};
  let r, i;
  for (i in t.properties)
    if (i !== "children" && ir.call(t.properties, i)) {
      const a = Tl(e, i, t.properties[i]);
      if (a) {
        const [s, o] = a;
        e.tableCellAlignToStyle && s === "align" && typeof o == "string" && ml.has(t.tagName) ? r = o : n[s] = o;
      }
    }
  if (r) {
    const a = (
      /** @type {Style} */
      n.style || (n.style = {})
    );
    a[e.stylePropertyNameCase === "css" ? "text-align" : "textAlign"] = r;
  }
  return n;
}
function Il(e, t) {
  const n = {};
  for (const r of t.attributes)
    if (r.type === "mdxJsxExpressionAttribute")
      if (r.data && r.data.estree && e.evaluater) {
        const a = r.data.estree.body[0];
        a.type;
        const s = a.expression;
        s.type;
        const o = s.properties[0];
        o.type, Object.assign(
          n,
          e.evaluater.evaluateExpression(o.argument)
        );
      } else
        Nt(e, t.position);
    else {
      const i = r.name;
      let a;
      if (r.value && typeof r.value == "object")
        if (r.value.data && r.value.data.estree && e.evaluater) {
          const o = r.value.data.estree.body[0];
          o.type, a = e.evaluater.evaluateExpression(o.expression);
        } else
          Nt(e, t.position);
      else
        a = r.value === null ? !0 : r.value;
      n[i] = /** @type {Props[keyof Props]} */
      a;
    }
  return n;
}
function sr(e, t) {
  const n = [];
  let r = -1;
  const i = e.passKeys ? /* @__PURE__ */ new Map() : hl;
  for (; ++r < t.children.length; ) {
    const a = t.children[r];
    let s;
    if (e.passKeys) {
      const u = a.type === "element" ? a.tagName : a.type === "mdxJsxFlowElement" || a.type === "mdxJsxTextElement" ? a.name : void 0;
      if (u) {
        const l = i.get(u) || 0;
        s = u + "-" + l, i.set(u, l + 1);
      }
    }
    const o = ka(e, a, s);
    o !== void 0 && n.push(o);
  }
  return n;
}
function Tl(e, t, n) {
  const r = tl(e.schema, t);
  if (!(n == null || typeof n == "number" && Number.isNaN(n))) {
    if (Array.isArray(n) && (n = r.commaSeparated ? Ho(n) : al(n)), r.property === "style") {
      let i = typeof n == "object" ? n : Ll(e, String(n));
      return e.stylePropertyNameCase === "css" && (i = Al(i)), ["style", i];
    }
    return [
      e.elementAttributeNameCase === "react" && r.space ? Xo[r.property] || r.property : r.attribute,
      n
    ];
  }
}
function Ll(e, t) {
  try {
    return fl(t, { reactCompat: !0 });
  } catch (n) {
    if (e.ignoreInvalidStyle)
      return {};
    const r = (
      /** @type {Error} */
      n
    ), i = new fe("Cannot parse `style` attribute", {
      ancestors: e.ancestors,
      cause: r,
      ruleId: "style",
      source: "hast-util-to-jsx-runtime"
    });
    throw i.file = e.filePath || void 0, i.url = xa + "#cannot-parse-style-attribute", i;
  }
}
function wa(e, t, n) {
  let r;
  if (!n)
    r = { type: "Literal", value: t };
  else if (t.includes(".")) {
    const i = t.split(".");
    let a = -1, s;
    for (; ++a < i.length; ) {
      const o = Yr(i[a]) ? { type: "Identifier", name: i[a] } : { type: "Literal", value: i[a] };
      s = s ? {
        type: "MemberExpression",
        object: s,
        property: o,
        computed: !!(a && o.type === "Literal"),
        optional: !1
      } : o;
    }
    r = s;
  } else
    r = Yr(t) && !/^[a-z]/.test(t) ? { type: "Identifier", name: t } : { type: "Literal", value: t };
  if (r.type === "Literal") {
    const i = (
      /** @type {string | number} */
      r.value
    );
    return ir.call(e.components, i) ? e.components[i] : i;
  }
  if (e.evaluater)
    return e.evaluater.evaluateExpression(r);
  Nt(e);
}
function Nt(e, t) {
  const n = new fe(
    "Cannot handle MDX estrees without `createEvaluater`",
    {
      ancestors: e.ancestors,
      place: t,
      ruleId: "mdx-estree",
      source: "hast-util-to-jsx-runtime"
    }
  );
  throw n.file = e.filePath || void 0, n.url = xa + "#cannot-handle-mdx-estrees-without-createevaluater", n;
}
function Al(e) {
  const t = {};
  let n;
  for (n in e)
    ir.call(e, n) && (t[Rl(n)] = e[n]);
  return t;
}
function Rl(e) {
  let t = e.replace(pl, Ol);
  return t.slice(0, 3) === "ms-" && (t = "-" + t), t;
}
function Ol(e) {
  return "-" + e.toLowerCase();
}
const gn = {
  action: ["form"],
  cite: ["blockquote", "del", "ins", "q"],
  data: ["object"],
  formAction: ["button", "input"],
  href: ["a", "area", "base", "link"],
  icon: ["menuitem"],
  itemId: null,
  manifest: ["html"],
  ping: ["a", "area"],
  poster: ["video"],
  src: [
    "audio",
    "embed",
    "iframe",
    "img",
    "input",
    "script",
    "source",
    "track",
    "video"
  ]
}, Pl = {};
function or(e, t) {
  const n = Pl, r = typeof n.includeImageAlt == "boolean" ? n.includeImageAlt : !0, i = typeof n.includeHtml == "boolean" ? n.includeHtml : !0;
  return Sa(e, r, i);
}
function Sa(e, t, n) {
  if (Dl(e)) {
    if ("value" in e)
      return e.type === "html" && !n ? "" : e.value;
    if (t && "alt" in e && e.alt)
      return e.alt;
    if ("children" in e)
      return si(e.children, t, n);
  }
  return Array.isArray(e) ? si(e, t, n) : "";
}
function si(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; )
    r[i] = Sa(e[i], t, n);
  return r.join("");
}
function Dl(e) {
  return !!(e && typeof e == "object");
}
const oi = document.createElement("i");
function lr(e) {
  const t = "&" + e + ";";
  oi.innerHTML = t;
  const n = oi.textContent;
  return n.charCodeAt(n.length - 1) === 59 && e !== "semi" || n === t ? !1 : n;
}
function ke(e, t, n, r) {
  const i = e.length;
  let a = 0, s;
  if (t < 0 ? t = -t > i ? 0 : i + t : t = t > i ? i : t, n = n > 0 ? n : 0, r.length < 1e4)
    s = Array.from(r), s.unshift(t, n), e.splice(...s);
  else
    for (n && e.splice(t, n); a < r.length; )
      s = r.slice(a, a + 1e4), s.unshift(t, 0), e.splice(...s), a += 1e4, t += 1e4;
}
function ve(e, t) {
  return e.length > 0 ? (ke(e, e.length, 0, t), e) : t;
}
const li = {}.hasOwnProperty;
function Ca(e) {
  const t = {};
  let n = -1;
  for (; ++n < e.length; )
    _l(t, e[n]);
  return t;
}
function _l(e, t) {
  let n;
  for (n in t) {
    const i = (li.call(e, n) ? e[n] : void 0) || (e[n] = {}), a = t[n];
    let s;
    if (a)
      for (s in a) {
        li.call(i, s) || (i[s] = []);
        const o = a[s];
        Fl(
          // @ts-expect-error Looks like a list.
          i[s],
          Array.isArray(o) ? o : o ? [o] : []
        );
      }
  }
}
function Fl(e, t) {
  let n = -1;
  const r = [];
  for (; ++n < t.length; )
    (t[n].add === "after" ? e : r).push(t[n]);
  ke(e, 0, 0, r);
}
function Ea(e, t) {
  const n = Number.parseInt(e, t);
  return (
    // C0 except for HT, LF, FF, CR, space.
    n < 9 || n === 11 || n > 13 && n < 32 || // Control character (DEL) of C0, and C1 controls.
    n > 126 && n < 160 || // Lone high surrogates and low surrogates.
    n > 55295 && n < 57344 || // Noncharacters.
    n > 64975 && n < 65008 || /* eslint-disable no-bitwise */
    (n & 65535) === 65535 || (n & 65535) === 65534 || /* eslint-enable no-bitwise */
    // Out of range
    n > 1114111 ? "�" : String.fromCodePoint(n)
  );
}
function Ne(e) {
  return e.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "").toLowerCase().toUpperCase();
}
const de = Be(/[A-Za-z]/), ce = Be(/[\dA-Za-z]/), Ml = Be(/[#-'*+\--9=?A-Z^-~]/);
function qt(e) {
  return (
    // Special whitespace codes (which have negative values), C0 and Control
    // character DEL
    e !== null && (e < 32 || e === 127)
  );
}
const Vn = Be(/\d/), zl = Be(/[\dA-Fa-f]/), jl = Be(/[!-/:-@[-`{-~]/);
function j(e) {
  return e !== null && e < -2;
}
function Z(e) {
  return e !== null && (e < 0 || e === 32);
}
function U(e) {
  return e === -2 || e === -1 || e === 32;
}
const Xt = Be(/\p{P}|\p{S}/u), Je = Be(/\s/);
function Be(e) {
  return t;
  function t(n) {
    return n !== null && n > -1 && e.test(String.fromCharCode(n));
  }
}
function lt(e) {
  const t = [];
  let n = -1, r = 0, i = 0;
  for (; ++n < e.length; ) {
    const a = e.charCodeAt(n);
    let s = "";
    if (a === 37 && ce(e.charCodeAt(n + 1)) && ce(e.charCodeAt(n + 2)))
      i = 2;
    else if (a < 128)
      /[!#$&-;=?-Z_a-z~]/.test(String.fromCharCode(a)) || (s = String.fromCharCode(a));
    else if (a > 55295 && a < 57344) {
      const o = e.charCodeAt(n + 1);
      a < 56320 && o > 56319 && o < 57344 ? (s = String.fromCharCode(a, o), i = 1) : s = "�";
    } else
      s = String.fromCharCode(a);
    s && (t.push(e.slice(r, n), encodeURIComponent(s)), r = n + i + 1, s = ""), i && (n += i, i = 0);
  }
  return t.join("") + e.slice(r);
}
function W(e, t, n, r) {
  const i = r ? r - 1 : Number.POSITIVE_INFINITY;
  let a = 0;
  return s;
  function s(u) {
    return U(u) ? (e.enter(n), o(u)) : t(u);
  }
  function o(u) {
    return U(u) && a++ < i ? (e.consume(u), o) : (e.exit(n), t(u));
  }
}
const $l = {
  tokenize: Bl
};
function Bl(e) {
  const t = e.attempt(this.parser.constructs.contentInitial, r, i);
  let n;
  return t;
  function r(o) {
    if (o === null) {
      e.consume(o);
      return;
    }
    return e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), W(e, t, "linePrefix");
  }
  function i(o) {
    return e.enter("paragraph"), a(o);
  }
  function a(o) {
    const u = e.enter("chunkText", {
      contentType: "text",
      previous: n
    });
    return n && (n.next = u), n = u, s(o);
  }
  function s(o) {
    if (o === null) {
      e.exit("chunkText"), e.exit("paragraph"), e.consume(o);
      return;
    }
    return j(o) ? (e.consume(o), e.exit("chunkText"), a) : (e.consume(o), s);
  }
}
const Vl = {
  tokenize: Hl
}, ui = {
  tokenize: Ul
};
function Hl(e) {
  const t = this, n = [];
  let r = 0, i, a, s;
  return o;
  function o(C) {
    if (r < n.length) {
      const N = n[r];
      return t.containerState = N[1], e.attempt(N[0].continuation, u, l)(C);
    }
    return l(C);
  }
  function u(C) {
    if (r++, t.containerState._closeFlow) {
      t.containerState._closeFlow = void 0, i && S();
      const N = t.events.length;
      let A = N, b;
      for (; A--; )
        if (t.events[A][0] === "exit" && t.events[A][1].type === "chunkFlow") {
          b = t.events[A][1].end;
          break;
        }
      k(r);
      let I = N;
      for (; I < t.events.length; )
        t.events[I][1].end = {
          ...b
        }, I++;
      return ke(t.events, A + 1, 0, t.events.slice(N)), t.events.length = I, l(C);
    }
    return o(C);
  }
  function l(C) {
    if (r === n.length) {
      if (!i)
        return h(C);
      if (i.currentConstruct && i.currentConstruct.concrete)
        return p(C);
      t.interrupt = !!(i.currentConstruct && !i._gfmTableDynamicInterruptHack);
    }
    return t.containerState = {}, e.check(ui, c, f)(C);
  }
  function c(C) {
    return i && S(), k(r), h(C);
  }
  function f(C) {
    return t.parser.lazy[t.now().line] = r !== n.length, s = t.now().offset, p(C);
  }
  function h(C) {
    return t.containerState = {}, e.attempt(ui, d, p)(C);
  }
  function d(C) {
    return r++, n.push([t.currentConstruct, t.containerState]), h(C);
  }
  function p(C) {
    if (C === null) {
      i && S(), k(0), e.consume(C);
      return;
    }
    return i = i || t.parser.flow(t.now()), e.enter("chunkFlow", {
      _tokenizer: i,
      contentType: "flow",
      previous: a
    }), m(C);
  }
  function m(C) {
    if (C === null) {
      v(e.exit("chunkFlow"), !0), k(0), e.consume(C);
      return;
    }
    return j(C) ? (e.consume(C), v(e.exit("chunkFlow")), r = 0, t.interrupt = void 0, o) : (e.consume(C), m);
  }
  function v(C, N) {
    const A = t.sliceStream(C);
    if (N && A.push(null), C.previous = a, a && (a.next = C), a = C, i.defineSkip(C.start), i.write(A), t.parser.lazy[C.start.line]) {
      let b = i.events.length;
      for (; b--; )
        if (
          // The token starts before the line ending…
          i.events[b][1].start.offset < s && // …and either is not ended yet…
          (!i.events[b][1].end || // …or ends after it.
          i.events[b][1].end.offset > s)
        )
          return;
      const I = t.events.length;
      let M = I, F, w;
      for (; M--; )
        if (t.events[M][0] === "exit" && t.events[M][1].type === "chunkFlow") {
          if (F) {
            w = t.events[M][1].end;
            break;
          }
          F = !0;
        }
      for (k(r), b = I; b < t.events.length; )
        t.events[b][1].end = {
          ...w
        }, b++;
      ke(t.events, M + 1, 0, t.events.slice(I)), t.events.length = b;
    }
  }
  function k(C) {
    let N = n.length;
    for (; N-- > C; ) {
      const A = n[N];
      t.containerState = A[1], A[0].exit.call(t, e);
    }
    n.length = C;
  }
  function S() {
    i.write([null]), a = void 0, i = void 0, t.containerState._closeFlow = void 0;
  }
}
function Ul(e, t, n) {
  return W(e, e.attempt(this.parser.constructs.document, t, n), "linePrefix", this.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4);
}
function st(e) {
  if (e === null || Z(e) || Je(e))
    return 1;
  if (Xt(e))
    return 2;
}
function Zt(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; ) {
    const a = e[i].resolveAll;
    a && !r.includes(a) && (t = a(t, n), r.push(a));
  }
  return t;
}
const Hn = {
  name: "attention",
  resolveAll: ql,
  tokenize: Kl
};
function ql(e, t) {
  let n = -1, r, i, a, s, o, u, l, c;
  for (; ++n < e.length; )
    if (e[n][0] === "enter" && e[n][1].type === "attentionSequence" && e[n][1]._close) {
      for (r = n; r--; )
        if (e[r][0] === "exit" && e[r][1].type === "attentionSequence" && e[r][1]._open && // If the markers are the same:
        t.sliceSerialize(e[r][1]).charCodeAt(0) === t.sliceSerialize(e[n][1]).charCodeAt(0)) {
          if ((e[r][1]._close || e[n][1]._open) && (e[n][1].end.offset - e[n][1].start.offset) % 3 && !((e[r][1].end.offset - e[r][1].start.offset + e[n][1].end.offset - e[n][1].start.offset) % 3))
            continue;
          u = e[r][1].end.offset - e[r][1].start.offset > 1 && e[n][1].end.offset - e[n][1].start.offset > 1 ? 2 : 1;
          const f = {
            ...e[r][1].end
          }, h = {
            ...e[n][1].start
          };
          ci(f, -u), ci(h, u), s = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: f,
            end: {
              ...e[r][1].end
            }
          }, o = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: {
              ...e[n][1].start
            },
            end: h
          }, a = {
            type: u > 1 ? "strongText" : "emphasisText",
            start: {
              ...e[r][1].end
            },
            end: {
              ...e[n][1].start
            }
          }, i = {
            type: u > 1 ? "strong" : "emphasis",
            start: {
              ...s.start
            },
            end: {
              ...o.end
            }
          }, e[r][1].end = {
            ...s.start
          }, e[n][1].start = {
            ...o.end
          }, l = [], e[r][1].end.offset - e[r][1].start.offset && (l = ve(l, [["enter", e[r][1], t], ["exit", e[r][1], t]])), l = ve(l, [["enter", i, t], ["enter", s, t], ["exit", s, t], ["enter", a, t]]), l = ve(l, Zt(t.parser.constructs.insideSpan.null, e.slice(r + 1, n), t)), l = ve(l, [["exit", a, t], ["enter", o, t], ["exit", o, t], ["exit", i, t]]), e[n][1].end.offset - e[n][1].start.offset ? (c = 2, l = ve(l, [["enter", e[n][1], t], ["exit", e[n][1], t]])) : c = 0, ke(e, r - 1, n - r + 3, l), n = r + l.length - c - 2;
          break;
        }
    }
  for (n = -1; ++n < e.length; )
    e[n][1].type === "attentionSequence" && (e[n][1].type = "data");
  return e;
}
function Kl(e, t) {
  const n = this.parser.constructs.attentionMarkers.null, r = this.previous, i = st(r);
  let a;
  return s;
  function s(u) {
    return a = u, e.enter("attentionSequence"), o(u);
  }
  function o(u) {
    if (u === a)
      return e.consume(u), o;
    const l = e.exit("attentionSequence"), c = st(u), f = !c || c === 2 && i || n.includes(u), h = !i || i === 2 && c || n.includes(r);
    return l._open = !!(a === 42 ? f : f && (i || !h)), l._close = !!(a === 42 ? h : h && (c || !f)), t(u);
  }
}
function ci(e, t) {
  e.column += t, e.offset += t, e._bufferIndex += t;
}
const Wl = {
  name: "autolink",
  tokenize: Gl
};
function Gl(e, t, n) {
  let r = 0;
  return i;
  function i(d) {
    return e.enter("autolink"), e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.enter("autolinkProtocol"), a;
  }
  function a(d) {
    return de(d) ? (e.consume(d), s) : d === 64 ? n(d) : l(d);
  }
  function s(d) {
    return d === 43 || d === 45 || d === 46 || ce(d) ? (r = 1, o(d)) : l(d);
  }
  function o(d) {
    return d === 58 ? (e.consume(d), r = 0, u) : (d === 43 || d === 45 || d === 46 || ce(d)) && r++ < 32 ? (e.consume(d), o) : (r = 0, l(d));
  }
  function u(d) {
    return d === 62 ? (e.exit("autolinkProtocol"), e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.exit("autolink"), t) : d === null || d === 32 || d === 60 || qt(d) ? n(d) : (e.consume(d), u);
  }
  function l(d) {
    return d === 64 ? (e.consume(d), c) : Ml(d) ? (e.consume(d), l) : n(d);
  }
  function c(d) {
    return ce(d) ? f(d) : n(d);
  }
  function f(d) {
    return d === 46 ? (e.consume(d), r = 0, c) : d === 62 ? (e.exit("autolinkProtocol").type = "autolinkEmail", e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.exit("autolink"), t) : h(d);
  }
  function h(d) {
    if ((d === 45 || ce(d)) && r++ < 63) {
      const p = d === 45 ? h : f;
      return e.consume(d), p;
    }
    return n(d);
  }
}
const Lt = {
  partial: !0,
  tokenize: Jl
};
function Jl(e, t, n) {
  return r;
  function r(a) {
    return U(a) ? W(e, i, "linePrefix")(a) : i(a);
  }
  function i(a) {
    return a === null || j(a) ? t(a) : n(a);
  }
}
const Na = {
  continuation: {
    tokenize: Ql
  },
  exit: Xl,
  name: "blockQuote",
  tokenize: Yl
};
function Yl(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    if (s === 62) {
      const o = r.containerState;
      return o.open || (e.enter("blockQuote", {
        _container: !0
      }), o.open = !0), e.enter("blockQuotePrefix"), e.enter("blockQuoteMarker"), e.consume(s), e.exit("blockQuoteMarker"), a;
    }
    return n(s);
  }
  function a(s) {
    return U(s) ? (e.enter("blockQuotePrefixWhitespace"), e.consume(s), e.exit("blockQuotePrefixWhitespace"), e.exit("blockQuotePrefix"), t) : (e.exit("blockQuotePrefix"), t(s));
  }
}
function Ql(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return U(s) ? W(e, a, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(s) : a(s);
  }
  function a(s) {
    return e.attempt(Na, t, n)(s);
  }
}
function Xl(e) {
  e.exit("blockQuote");
}
const Ia = {
  name: "characterEscape",
  tokenize: Zl
};
function Zl(e, t, n) {
  return r;
  function r(a) {
    return e.enter("characterEscape"), e.enter("escapeMarker"), e.consume(a), e.exit("escapeMarker"), i;
  }
  function i(a) {
    return jl(a) ? (e.enter("characterEscapeValue"), e.consume(a), e.exit("characterEscapeValue"), e.exit("characterEscape"), t) : n(a);
  }
}
const Ta = {
  name: "characterReference",
  tokenize: eu
};
function eu(e, t, n) {
  const r = this;
  let i = 0, a, s;
  return o;
  function o(f) {
    return e.enter("characterReference"), e.enter("characterReferenceMarker"), e.consume(f), e.exit("characterReferenceMarker"), u;
  }
  function u(f) {
    return f === 35 ? (e.enter("characterReferenceMarkerNumeric"), e.consume(f), e.exit("characterReferenceMarkerNumeric"), l) : (e.enter("characterReferenceValue"), a = 31, s = ce, c(f));
  }
  function l(f) {
    return f === 88 || f === 120 ? (e.enter("characterReferenceMarkerHexadecimal"), e.consume(f), e.exit("characterReferenceMarkerHexadecimal"), e.enter("characterReferenceValue"), a = 6, s = zl, c) : (e.enter("characterReferenceValue"), a = 7, s = Vn, c(f));
  }
  function c(f) {
    if (f === 59 && i) {
      const h = e.exit("characterReferenceValue");
      return s === ce && !lr(r.sliceSerialize(h)) ? n(f) : (e.enter("characterReferenceMarker"), e.consume(f), e.exit("characterReferenceMarker"), e.exit("characterReference"), t);
    }
    return s(f) && i++ < a ? (e.consume(f), c) : n(f);
  }
}
const fi = {
  partial: !0,
  tokenize: nu
}, di = {
  concrete: !0,
  name: "codeFenced",
  tokenize: tu
};
function tu(e, t, n) {
  const r = this, i = {
    partial: !0,
    tokenize: A
  };
  let a = 0, s = 0, o;
  return u;
  function u(b) {
    return l(b);
  }
  function l(b) {
    const I = r.events[r.events.length - 1];
    return a = I && I[1].type === "linePrefix" ? I[2].sliceSerialize(I[1], !0).length : 0, o = b, e.enter("codeFenced"), e.enter("codeFencedFence"), e.enter("codeFencedFenceSequence"), c(b);
  }
  function c(b) {
    return b === o ? (s++, e.consume(b), c) : s < 3 ? n(b) : (e.exit("codeFencedFenceSequence"), U(b) ? W(e, f, "whitespace")(b) : f(b));
  }
  function f(b) {
    return b === null || j(b) ? (e.exit("codeFencedFence"), r.interrupt ? t(b) : e.check(fi, m, N)(b)) : (e.enter("codeFencedFenceInfo"), e.enter("chunkString", {
      contentType: "string"
    }), h(b));
  }
  function h(b) {
    return b === null || j(b) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), f(b)) : U(b) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), W(e, d, "whitespace")(b)) : b === 96 && b === o ? n(b) : (e.consume(b), h);
  }
  function d(b) {
    return b === null || j(b) ? f(b) : (e.enter("codeFencedFenceMeta"), e.enter("chunkString", {
      contentType: "string"
    }), p(b));
  }
  function p(b) {
    return b === null || j(b) ? (e.exit("chunkString"), e.exit("codeFencedFenceMeta"), f(b)) : b === 96 && b === o ? n(b) : (e.consume(b), p);
  }
  function m(b) {
    return e.attempt(i, N, v)(b);
  }
  function v(b) {
    return e.enter("lineEnding"), e.consume(b), e.exit("lineEnding"), k;
  }
  function k(b) {
    return a > 0 && U(b) ? W(e, S, "linePrefix", a + 1)(b) : S(b);
  }
  function S(b) {
    return b === null || j(b) ? e.check(fi, m, N)(b) : (e.enter("codeFlowValue"), C(b));
  }
  function C(b) {
    return b === null || j(b) ? (e.exit("codeFlowValue"), S(b)) : (e.consume(b), C);
  }
  function N(b) {
    return e.exit("codeFenced"), t(b);
  }
  function A(b, I, M) {
    let F = 0;
    return w;
    function w(O) {
      return b.enter("lineEnding"), b.consume(O), b.exit("lineEnding"), R;
    }
    function R(O) {
      return b.enter("codeFencedFence"), U(O) ? W(b, D, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(O) : D(O);
    }
    function D(O) {
      return O === o ? (b.enter("codeFencedFenceSequence"), z(O)) : M(O);
    }
    function z(O) {
      return O === o ? (F++, b.consume(O), z) : F >= s ? (b.exit("codeFencedFenceSequence"), U(O) ? W(b, _, "whitespace")(O) : _(O)) : M(O);
    }
    function _(O) {
      return O === null || j(O) ? (b.exit("codeFencedFence"), I(O)) : M(O);
    }
  }
}
function nu(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return s === null ? n(s) : (e.enter("lineEnding"), e.consume(s), e.exit("lineEnding"), a);
  }
  function a(s) {
    return r.parser.lazy[r.now().line] ? n(s) : t(s);
  }
}
const mn = {
  name: "codeIndented",
  tokenize: iu
}, ru = {
  partial: !0,
  tokenize: au
};
function iu(e, t, n) {
  const r = this;
  return i;
  function i(l) {
    return e.enter("codeIndented"), W(e, a, "linePrefix", 5)(l);
  }
  function a(l) {
    const c = r.events[r.events.length - 1];
    return c && c[1].type === "linePrefix" && c[2].sliceSerialize(c[1], !0).length >= 4 ? s(l) : n(l);
  }
  function s(l) {
    return l === null ? u(l) : j(l) ? e.attempt(ru, s, u)(l) : (e.enter("codeFlowValue"), o(l));
  }
  function o(l) {
    return l === null || j(l) ? (e.exit("codeFlowValue"), s(l)) : (e.consume(l), o);
  }
  function u(l) {
    return e.exit("codeIndented"), t(l);
  }
}
function au(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return r.parser.lazy[r.now().line] ? n(s) : j(s) ? (e.enter("lineEnding"), e.consume(s), e.exit("lineEnding"), i) : W(e, a, "linePrefix", 5)(s);
  }
  function a(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "linePrefix" && o[2].sliceSerialize(o[1], !0).length >= 4 ? t(s) : j(s) ? i(s) : n(s);
  }
}
const su = {
  name: "codeText",
  previous: lu,
  resolve: ou,
  tokenize: uu
};
function ou(e) {
  let t = e.length - 4, n = 3, r, i;
  if ((e[n][1].type === "lineEnding" || e[n][1].type === "space") && (e[t][1].type === "lineEnding" || e[t][1].type === "space")) {
    for (r = n; ++r < t; )
      if (e[r][1].type === "codeTextData") {
        e[n][1].type = "codeTextPadding", e[t][1].type = "codeTextPadding", n += 2, t -= 2;
        break;
      }
  }
  for (r = n - 1, t++; ++r <= t; )
    i === void 0 ? r !== t && e[r][1].type !== "lineEnding" && (i = r) : (r === t || e[r][1].type === "lineEnding") && (e[i][1].type = "codeTextData", r !== i + 2 && (e[i][1].end = e[r - 1][1].end, e.splice(i + 2, r - i - 2), t -= r - i - 2, r = i + 2), i = void 0);
  return e;
}
function lu(e) {
  return e !== 96 || this.events[this.events.length - 1][1].type === "characterEscape";
}
function uu(e, t, n) {
  let r = 0, i, a;
  return s;
  function s(f) {
    return e.enter("codeText"), e.enter("codeTextSequence"), o(f);
  }
  function o(f) {
    return f === 96 ? (e.consume(f), r++, o) : (e.exit("codeTextSequence"), u(f));
  }
  function u(f) {
    return f === null ? n(f) : f === 32 ? (e.enter("space"), e.consume(f), e.exit("space"), u) : f === 96 ? (a = e.enter("codeTextSequence"), i = 0, c(f)) : j(f) ? (e.enter("lineEnding"), e.consume(f), e.exit("lineEnding"), u) : (e.enter("codeTextData"), l(f));
  }
  function l(f) {
    return f === null || f === 32 || f === 96 || j(f) ? (e.exit("codeTextData"), u(f)) : (e.consume(f), l);
  }
  function c(f) {
    return f === 96 ? (e.consume(f), i++, c) : i === r ? (e.exit("codeTextSequence"), e.exit("codeText"), t(f)) : (a.type = "codeTextData", l(f));
  }
}
class cu {
  /**
   * @param {ReadonlyArray<T> | null | undefined} [initial]
   *   Initial items (optional).
   * @returns
   *   Splice buffer.
   */
  constructor(t) {
    this.left = t ? [...t] : [], this.right = [];
  }
  /**
   * Array access;
   * does not move the cursor.
   *
   * @param {number} index
   *   Index.
   * @return {T}
   *   Item.
   */
  get(t) {
    if (t < 0 || t >= this.left.length + this.right.length)
      throw new RangeError("Cannot access index `" + t + "` in a splice buffer of size `" + (this.left.length + this.right.length) + "`");
    return t < this.left.length ? this.left[t] : this.right[this.right.length - t + this.left.length - 1];
  }
  /**
   * The length of the splice buffer, one greater than the largest index in the
   * array.
   */
  get length() {
    return this.left.length + this.right.length;
  }
  /**
   * Remove and return `list[0]`;
   * moves the cursor to `0`.
   *
   * @returns {T | undefined}
   *   Item, optional.
   */
  shift() {
    return this.setCursor(0), this.right.pop();
  }
  /**
   * Slice the buffer to get an array;
   * does not move the cursor.
   *
   * @param {number} start
   *   Start.
   * @param {number | null | undefined} [end]
   *   End (optional).
   * @returns {Array<T>}
   *   Array of items.
   */
  slice(t, n) {
    const r = n ?? Number.POSITIVE_INFINITY;
    return r < this.left.length ? this.left.slice(t, r) : t > this.left.length ? this.right.slice(this.right.length - r + this.left.length, this.right.length - t + this.left.length).reverse() : this.left.slice(t).concat(this.right.slice(this.right.length - r + this.left.length).reverse());
  }
  /**
   * Mimics the behavior of Array.prototype.splice() except for the change of
   * interface necessary to avoid segfaults when patching in very large arrays.
   *
   * This operation moves cursor is moved to `start` and results in the cursor
   * placed after any inserted items.
   *
   * @param {number} start
   *   Start;
   *   zero-based index at which to start changing the array;
   *   negative numbers count backwards from the end of the array and values
   *   that are out-of bounds are clamped to the appropriate end of the array.
   * @param {number | null | undefined} [deleteCount=0]
   *   Delete count (default: `0`);
   *   maximum number of elements to delete, starting from start.
   * @param {Array<T> | null | undefined} [items=[]]
   *   Items to include in place of the deleted items (default: `[]`).
   * @return {Array<T>}
   *   Any removed items.
   */
  splice(t, n, r) {
    const i = n || 0;
    this.setCursor(Math.trunc(t));
    const a = this.right.splice(this.right.length - i, Number.POSITIVE_INFINITY);
    return r && yt(this.left, r), a.reverse();
  }
  /**
   * Remove and return the highest-numbered item in the array, so
   * `list[list.length - 1]`;
   * Moves the cursor to `length`.
   *
   * @returns {T | undefined}
   *   Item, optional.
   */
  pop() {
    return this.setCursor(Number.POSITIVE_INFINITY), this.left.pop();
  }
  /**
   * Inserts a single item to the high-numbered side of the array;
   * moves the cursor to `length`.
   *
   * @param {T} item
   *   Item.
   * @returns {undefined}
   *   Nothing.
   */
  push(t) {
    this.setCursor(Number.POSITIVE_INFINITY), this.left.push(t);
  }
  /**
   * Inserts many items to the high-numbered side of the array.
   * Moves the cursor to `length`.
   *
   * @param {Array<T>} items
   *   Items.
   * @returns {undefined}
   *   Nothing.
   */
  pushMany(t) {
    this.setCursor(Number.POSITIVE_INFINITY), yt(this.left, t);
  }
  /**
   * Inserts a single item to the low-numbered side of the array;
   * Moves the cursor to `0`.
   *
   * @param {T} item
   *   Item.
   * @returns {undefined}
   *   Nothing.
   */
  unshift(t) {
    this.setCursor(0), this.right.push(t);
  }
  /**
   * Inserts many items to the low-numbered side of the array;
   * moves the cursor to `0`.
   *
   * @param {Array<T>} items
   *   Items.
   * @returns {undefined}
   *   Nothing.
   */
  unshiftMany(t) {
    this.setCursor(0), yt(this.right, t.reverse());
  }
  /**
   * Move the cursor to a specific position in the array. Requires
   * time proportional to the distance moved.
   *
   * If `n < 0`, the cursor will end up at the beginning.
   * If `n > length`, the cursor will end up at the end.
   *
   * @param {number} n
   *   Position.
   * @return {undefined}
   *   Nothing.
   */
  setCursor(t) {
    if (!(t === this.left.length || t > this.left.length && this.right.length === 0 || t < 0 && this.left.length === 0))
      if (t < this.left.length) {
        const n = this.left.splice(t, Number.POSITIVE_INFINITY);
        yt(this.right, n.reverse());
      } else {
        const n = this.right.splice(this.left.length + this.right.length - t, Number.POSITIVE_INFINITY);
        yt(this.left, n.reverse());
      }
  }
}
function yt(e, t) {
  let n = 0;
  if (t.length < 1e4)
    e.push(...t);
  else
    for (; n < t.length; )
      e.push(...t.slice(n, n + 1e4)), n += 1e4;
}
function La(e) {
  const t = {};
  let n = -1, r, i, a, s, o, u, l;
  const c = new cu(e);
  for (; ++n < c.length; ) {
    for (; n in t; )
      n = t[n];
    if (r = c.get(n), n && r[1].type === "chunkFlow" && c.get(n - 1)[1].type === "listItemPrefix" && (u = r[1]._tokenizer.events, a = 0, a < u.length && u[a][1].type === "lineEndingBlank" && (a += 2), a < u.length && u[a][1].type === "content"))
      for (; ++a < u.length && u[a][1].type !== "content"; )
        u[a][1].type === "chunkText" && (u[a][1]._isInFirstContentOfListItem = !0, a++);
    if (r[0] === "enter")
      r[1].contentType && (Object.assign(t, fu(c, n)), n = t[n], l = !0);
    else if (r[1]._container) {
      for (a = n, i = void 0; a--; )
        if (s = c.get(a), s[1].type === "lineEnding" || s[1].type === "lineEndingBlank")
          s[0] === "enter" && (i && (c.get(i)[1].type = "lineEndingBlank"), s[1].type = "lineEnding", i = a);
        else if (!(s[1].type === "linePrefix" || s[1].type === "listItemIndent")) break;
      i && (r[1].end = {
        ...c.get(i)[1].start
      }, o = c.slice(i, n), o.unshift(r), c.splice(i, n - i + 1, o));
    }
  }
  return ke(e, 0, Number.POSITIVE_INFINITY, c.slice(0)), !l;
}
function fu(e, t) {
  const n = e.get(t)[1], r = e.get(t)[2];
  let i = t - 1;
  const a = [];
  let s = n._tokenizer;
  s || (s = r.parser[n.contentType](n.start), n._contentTypeTextTrailing && (s._contentTypeTextTrailing = !0));
  const o = s.events, u = [], l = {};
  let c, f, h = -1, d = n, p = 0, m = 0;
  const v = [m];
  for (; d; ) {
    for (; e.get(++i)[1] !== d; )
      ;
    a.push(i), d._tokenizer || (c = r.sliceStream(d), d.next || c.push(null), f && s.defineSkip(d.start), d._isInFirstContentOfListItem && (s._gfmTasklistFirstContentOfListItem = !0), s.write(c), d._isInFirstContentOfListItem && (s._gfmTasklistFirstContentOfListItem = void 0)), f = d, d = d.next;
  }
  for (d = n; ++h < o.length; )
    // Find a void token that includes a break.
    o[h][0] === "exit" && o[h - 1][0] === "enter" && o[h][1].type === o[h - 1][1].type && o[h][1].start.line !== o[h][1].end.line && (m = h + 1, v.push(m), d._tokenizer = void 0, d.previous = void 0, d = d.next);
  for (s.events = [], d ? (d._tokenizer = void 0, d.previous = void 0) : v.pop(), h = v.length; h--; ) {
    const k = o.slice(v[h], v[h + 1]), S = a.pop();
    u.push([S, S + k.length - 1]), e.splice(S, 2, k);
  }
  for (u.reverse(), h = -1; ++h < u.length; )
    l[p + u[h][0]] = p + u[h][1], p += u[h][1] - u[h][0] - 1;
  return l;
}
const du = {
  resolve: pu,
  tokenize: gu
}, hu = {
  partial: !0,
  tokenize: mu
};
function pu(e) {
  return La(e), e;
}
function gu(e, t) {
  let n;
  return r;
  function r(o) {
    return e.enter("content"), n = e.enter("chunkContent", {
      contentType: "content"
    }), i(o);
  }
  function i(o) {
    return o === null ? a(o) : j(o) ? e.check(hu, s, a)(o) : (e.consume(o), i);
  }
  function a(o) {
    return e.exit("chunkContent"), e.exit("content"), t(o);
  }
  function s(o) {
    return e.consume(o), e.exit("chunkContent"), n.next = e.enter("chunkContent", {
      contentType: "content",
      previous: n
    }), n = n.next, i;
  }
}
function mu(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return e.exit("chunkContent"), e.enter("lineEnding"), e.consume(s), e.exit("lineEnding"), W(e, a, "linePrefix");
  }
  function a(s) {
    if (s === null || j(s))
      return n(s);
    const o = r.events[r.events.length - 1];
    return !r.parser.constructs.disable.null.includes("codeIndented") && o && o[1].type === "linePrefix" && o[2].sliceSerialize(o[1], !0).length >= 4 ? t(s) : e.interrupt(r.parser.constructs.flow, n, t)(s);
  }
}
function Aa(e, t, n, r, i, a, s, o, u) {
  const l = u || Number.POSITIVE_INFINITY;
  let c = 0;
  return f;
  function f(k) {
    return k === 60 ? (e.enter(r), e.enter(i), e.enter(a), e.consume(k), e.exit(a), h) : k === null || k === 32 || k === 41 || qt(k) ? n(k) : (e.enter(r), e.enter(s), e.enter(o), e.enter("chunkString", {
      contentType: "string"
    }), m(k));
  }
  function h(k) {
    return k === 62 ? (e.enter(a), e.consume(k), e.exit(a), e.exit(i), e.exit(r), t) : (e.enter(o), e.enter("chunkString", {
      contentType: "string"
    }), d(k));
  }
  function d(k) {
    return k === 62 ? (e.exit("chunkString"), e.exit(o), h(k)) : k === null || k === 60 || j(k) ? n(k) : (e.consume(k), k === 92 ? p : d);
  }
  function p(k) {
    return k === 60 || k === 62 || k === 92 ? (e.consume(k), d) : d(k);
  }
  function m(k) {
    return !c && (k === null || k === 41 || Z(k)) ? (e.exit("chunkString"), e.exit(o), e.exit(s), e.exit(r), t(k)) : c < l && k === 40 ? (e.consume(k), c++, m) : k === 41 ? (e.consume(k), c--, m) : k === null || k === 32 || k === 40 || qt(k) ? n(k) : (e.consume(k), k === 92 ? v : m);
  }
  function v(k) {
    return k === 40 || k === 41 || k === 92 ? (e.consume(k), m) : m(k);
  }
}
function Ra(e, t, n, r, i, a) {
  const s = this;
  let o = 0, u;
  return l;
  function l(d) {
    return e.enter(r), e.enter(i), e.consume(d), e.exit(i), e.enter(a), c;
  }
  function c(d) {
    return o > 999 || d === null || d === 91 || d === 93 && !u || // To do: remove in the future once we’ve switched from
    // `micromark-extension-footnote` to `micromark-extension-gfm-footnote`,
    // which doesn’t need this.
    // Hidden footnotes hook.
    /* c8 ignore next 3 */
    d === 94 && !o && "_hiddenFootnoteSupport" in s.parser.constructs ? n(d) : d === 93 ? (e.exit(a), e.enter(i), e.consume(d), e.exit(i), e.exit(r), t) : j(d) ? (e.enter("lineEnding"), e.consume(d), e.exit("lineEnding"), c) : (e.enter("chunkString", {
      contentType: "string"
    }), f(d));
  }
  function f(d) {
    return d === null || d === 91 || d === 93 || j(d) || o++ > 999 ? (e.exit("chunkString"), c(d)) : (e.consume(d), u || (u = !U(d)), d === 92 ? h : f);
  }
  function h(d) {
    return d === 91 || d === 92 || d === 93 ? (e.consume(d), o++, f) : f(d);
  }
}
function Oa(e, t, n, r, i, a) {
  let s;
  return o;
  function o(h) {
    return h === 34 || h === 39 || h === 40 ? (e.enter(r), e.enter(i), e.consume(h), e.exit(i), s = h === 40 ? 41 : h, u) : n(h);
  }
  function u(h) {
    return h === s ? (e.enter(i), e.consume(h), e.exit(i), e.exit(r), t) : (e.enter(a), l(h));
  }
  function l(h) {
    return h === s ? (e.exit(a), u(s)) : h === null ? n(h) : j(h) ? (e.enter("lineEnding"), e.consume(h), e.exit("lineEnding"), W(e, l, "linePrefix")) : (e.enter("chunkString", {
      contentType: "string"
    }), c(h));
  }
  function c(h) {
    return h === s || h === null || j(h) ? (e.exit("chunkString"), l(h)) : (e.consume(h), h === 92 ? f : c);
  }
  function f(h) {
    return h === s || h === 92 ? (e.consume(h), c) : c(h);
  }
}
function St(e, t) {
  let n;
  return r;
  function r(i) {
    return j(i) ? (e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), n = !0, r) : U(i) ? W(e, r, n ? "linePrefix" : "lineSuffix")(i) : t(i);
  }
}
const yu = {
  name: "definition",
  tokenize: xu
}, bu = {
  partial: !0,
  tokenize: ku
};
function xu(e, t, n) {
  const r = this;
  let i;
  return a;
  function a(d) {
    return e.enter("definition"), s(d);
  }
  function s(d) {
    return Ra.call(
      r,
      e,
      o,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionLabel",
      "definitionLabelMarker",
      "definitionLabelString"
    )(d);
  }
  function o(d) {
    return i = Ne(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1)), d === 58 ? (e.enter("definitionMarker"), e.consume(d), e.exit("definitionMarker"), u) : n(d);
  }
  function u(d) {
    return Z(d) ? St(e, l)(d) : l(d);
  }
  function l(d) {
    return Aa(
      e,
      c,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionDestination",
      "definitionDestinationLiteral",
      "definitionDestinationLiteralMarker",
      "definitionDestinationRaw",
      "definitionDestinationString"
    )(d);
  }
  function c(d) {
    return e.attempt(bu, f, f)(d);
  }
  function f(d) {
    return U(d) ? W(e, h, "whitespace")(d) : h(d);
  }
  function h(d) {
    return d === null || j(d) ? (e.exit("definition"), r.parser.defined.push(i), t(d)) : n(d);
  }
}
function ku(e, t, n) {
  return r;
  function r(o) {
    return Z(o) ? St(e, i)(o) : n(o);
  }
  function i(o) {
    return Oa(e, a, n, "definitionTitle", "definitionTitleMarker", "definitionTitleString")(o);
  }
  function a(o) {
    return U(o) ? W(e, s, "whitespace")(o) : s(o);
  }
  function s(o) {
    return o === null || j(o) ? t(o) : n(o);
  }
}
const vu = {
  name: "hardBreakEscape",
  tokenize: wu
};
function wu(e, t, n) {
  return r;
  function r(a) {
    return e.enter("hardBreakEscape"), e.consume(a), i;
  }
  function i(a) {
    return j(a) ? (e.exit("hardBreakEscape"), t(a)) : n(a);
  }
}
const Su = {
  name: "headingAtx",
  resolve: Cu,
  tokenize: Eu
};
function Cu(e, t) {
  let n = e.length - 2, r = 3, i, a;
  return e[r][1].type === "whitespace" && (r += 2), n - 2 > r && e[n][1].type === "whitespace" && (n -= 2), e[n][1].type === "atxHeadingSequence" && (r === n - 1 || n - 4 > r && e[n - 2][1].type === "whitespace") && (n -= r + 1 === n ? 2 : 4), n > r && (i = {
    type: "atxHeadingText",
    start: e[r][1].start,
    end: e[n][1].end
  }, a = {
    type: "chunkText",
    start: e[r][1].start,
    end: e[n][1].end,
    contentType: "text"
  }, ke(e, r, n - r + 1, [["enter", i, t], ["enter", a, t], ["exit", a, t], ["exit", i, t]])), e;
}
function Eu(e, t, n) {
  let r = 0;
  return i;
  function i(c) {
    return e.enter("atxHeading"), a(c);
  }
  function a(c) {
    return e.enter("atxHeadingSequence"), s(c);
  }
  function s(c) {
    return c === 35 && r++ < 6 ? (e.consume(c), s) : c === null || Z(c) ? (e.exit("atxHeadingSequence"), o(c)) : n(c);
  }
  function o(c) {
    return c === 35 ? (e.enter("atxHeadingSequence"), u(c)) : c === null || j(c) ? (e.exit("atxHeading"), t(c)) : U(c) ? W(e, o, "whitespace")(c) : (e.enter("atxHeadingText"), l(c));
  }
  function u(c) {
    return c === 35 ? (e.consume(c), u) : (e.exit("atxHeadingSequence"), o(c));
  }
  function l(c) {
    return c === null || c === 35 || Z(c) ? (e.exit("atxHeadingText"), o(c)) : (e.consume(c), l);
  }
}
const Nu = [
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
], hi = ["pre", "script", "style", "textarea"], Iu = {
  concrete: !0,
  name: "htmlFlow",
  resolveTo: Au,
  tokenize: Ru
}, Tu = {
  partial: !0,
  tokenize: Pu
}, Lu = {
  partial: !0,
  tokenize: Ou
};
function Au(e) {
  let t = e.length;
  for (; t-- && !(e[t][0] === "enter" && e[t][1].type === "htmlFlow"); )
    ;
  return t > 1 && e[t - 2][1].type === "linePrefix" && (e[t][1].start = e[t - 2][1].start, e[t + 1][1].start = e[t - 2][1].start, e.splice(t - 2, 2)), e;
}
function Ru(e, t, n) {
  const r = this;
  let i, a, s, o, u;
  return l;
  function l(x) {
    return c(x);
  }
  function c(x) {
    return e.enter("htmlFlow"), e.enter("htmlFlowData"), e.consume(x), f;
  }
  function f(x) {
    return x === 33 ? (e.consume(x), h) : x === 47 ? (e.consume(x), a = !0, m) : x === 63 ? (e.consume(x), i = 3, r.interrupt ? t : y) : de(x) ? (e.consume(x), s = String.fromCharCode(x), v) : n(x);
  }
  function h(x) {
    return x === 45 ? (e.consume(x), i = 2, d) : x === 91 ? (e.consume(x), i = 5, o = 0, p) : de(x) ? (e.consume(x), i = 4, r.interrupt ? t : y) : n(x);
  }
  function d(x) {
    return x === 45 ? (e.consume(x), r.interrupt ? t : y) : n(x);
  }
  function p(x) {
    const pe = "CDATA[";
    return x === pe.charCodeAt(o++) ? (e.consume(x), o === pe.length ? r.interrupt ? t : D : p) : n(x);
  }
  function m(x) {
    return de(x) ? (e.consume(x), s = String.fromCharCode(x), v) : n(x);
  }
  function v(x) {
    if (x === null || x === 47 || x === 62 || Z(x)) {
      const pe = x === 47, Ve = s.toLowerCase();
      return !pe && !a && hi.includes(Ve) ? (i = 1, r.interrupt ? t(x) : D(x)) : Nu.includes(s.toLowerCase()) ? (i = 6, pe ? (e.consume(x), k) : r.interrupt ? t(x) : D(x)) : (i = 7, r.interrupt && !r.parser.lazy[r.now().line] ? n(x) : a ? S(x) : C(x));
    }
    return x === 45 || ce(x) ? (e.consume(x), s += String.fromCharCode(x), v) : n(x);
  }
  function k(x) {
    return x === 62 ? (e.consume(x), r.interrupt ? t : D) : n(x);
  }
  function S(x) {
    return U(x) ? (e.consume(x), S) : w(x);
  }
  function C(x) {
    return x === 47 ? (e.consume(x), w) : x === 58 || x === 95 || de(x) ? (e.consume(x), N) : U(x) ? (e.consume(x), C) : w(x);
  }
  function N(x) {
    return x === 45 || x === 46 || x === 58 || x === 95 || ce(x) ? (e.consume(x), N) : A(x);
  }
  function A(x) {
    return x === 61 ? (e.consume(x), b) : U(x) ? (e.consume(x), A) : C(x);
  }
  function b(x) {
    return x === null || x === 60 || x === 61 || x === 62 || x === 96 ? n(x) : x === 34 || x === 39 ? (e.consume(x), u = x, I) : U(x) ? (e.consume(x), b) : M(x);
  }
  function I(x) {
    return x === u ? (e.consume(x), u = null, F) : x === null || j(x) ? n(x) : (e.consume(x), I);
  }
  function M(x) {
    return x === null || x === 34 || x === 39 || x === 47 || x === 60 || x === 61 || x === 62 || x === 96 || Z(x) ? A(x) : (e.consume(x), M);
  }
  function F(x) {
    return x === 47 || x === 62 || U(x) ? C(x) : n(x);
  }
  function w(x) {
    return x === 62 ? (e.consume(x), R) : n(x);
  }
  function R(x) {
    return x === null || j(x) ? D(x) : U(x) ? (e.consume(x), R) : n(x);
  }
  function D(x) {
    return x === 45 && i === 2 ? (e.consume(x), B) : x === 60 && i === 1 ? (e.consume(x), K) : x === 62 && i === 4 ? (e.consume(x), G) : x === 63 && i === 3 ? (e.consume(x), y) : x === 93 && i === 5 ? (e.consume(x), se) : j(x) && (i === 6 || i === 7) ? (e.exit("htmlFlowData"), e.check(Tu, oe, z)(x)) : x === null || j(x) ? (e.exit("htmlFlowData"), z(x)) : (e.consume(x), D);
  }
  function z(x) {
    return e.check(Lu, _, oe)(x);
  }
  function _(x) {
    return e.enter("lineEnding"), e.consume(x), e.exit("lineEnding"), O;
  }
  function O(x) {
    return x === null || j(x) ? z(x) : (e.enter("htmlFlowData"), D(x));
  }
  function B(x) {
    return x === 45 ? (e.consume(x), y) : D(x);
  }
  function K(x) {
    return x === 47 ? (e.consume(x), s = "", ie) : D(x);
  }
  function ie(x) {
    if (x === 62) {
      const pe = s.toLowerCase();
      return hi.includes(pe) ? (e.consume(x), G) : D(x);
    }
    return de(x) && s.length < 8 ? (e.consume(x), s += String.fromCharCode(x), ie) : D(x);
  }
  function se(x) {
    return x === 93 ? (e.consume(x), y) : D(x);
  }
  function y(x) {
    return x === 62 ? (e.consume(x), G) : x === 45 && i === 2 ? (e.consume(x), y) : D(x);
  }
  function G(x) {
    return x === null || j(x) ? (e.exit("htmlFlowData"), oe(x)) : (e.consume(x), G);
  }
  function oe(x) {
    return e.exit("htmlFlow"), t(x);
  }
}
function Ou(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return j(s) ? (e.enter("lineEnding"), e.consume(s), e.exit("lineEnding"), a) : n(s);
  }
  function a(s) {
    return r.parser.lazy[r.now().line] ? n(s) : t(s);
  }
}
function Pu(e, t, n) {
  return r;
  function r(i) {
    return e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), e.attempt(Lt, t, n);
  }
}
const Du = {
  name: "htmlText",
  tokenize: _u
};
function _u(e, t, n) {
  const r = this;
  let i, a, s;
  return o;
  function o(y) {
    return e.enter("htmlText"), e.enter("htmlTextData"), e.consume(y), u;
  }
  function u(y) {
    return y === 33 ? (e.consume(y), l) : y === 47 ? (e.consume(y), A) : y === 63 ? (e.consume(y), C) : de(y) ? (e.consume(y), M) : n(y);
  }
  function l(y) {
    return y === 45 ? (e.consume(y), c) : y === 91 ? (e.consume(y), a = 0, p) : de(y) ? (e.consume(y), S) : n(y);
  }
  function c(y) {
    return y === 45 ? (e.consume(y), d) : n(y);
  }
  function f(y) {
    return y === null ? n(y) : y === 45 ? (e.consume(y), h) : j(y) ? (s = f, K(y)) : (e.consume(y), f);
  }
  function h(y) {
    return y === 45 ? (e.consume(y), d) : f(y);
  }
  function d(y) {
    return y === 62 ? B(y) : y === 45 ? h(y) : f(y);
  }
  function p(y) {
    const G = "CDATA[";
    return y === G.charCodeAt(a++) ? (e.consume(y), a === G.length ? m : p) : n(y);
  }
  function m(y) {
    return y === null ? n(y) : y === 93 ? (e.consume(y), v) : j(y) ? (s = m, K(y)) : (e.consume(y), m);
  }
  function v(y) {
    return y === 93 ? (e.consume(y), k) : m(y);
  }
  function k(y) {
    return y === 62 ? B(y) : y === 93 ? (e.consume(y), k) : m(y);
  }
  function S(y) {
    return y === null || y === 62 ? B(y) : j(y) ? (s = S, K(y)) : (e.consume(y), S);
  }
  function C(y) {
    return y === null ? n(y) : y === 63 ? (e.consume(y), N) : j(y) ? (s = C, K(y)) : (e.consume(y), C);
  }
  function N(y) {
    return y === 62 ? B(y) : C(y);
  }
  function A(y) {
    return de(y) ? (e.consume(y), b) : n(y);
  }
  function b(y) {
    return y === 45 || ce(y) ? (e.consume(y), b) : I(y);
  }
  function I(y) {
    return j(y) ? (s = I, K(y)) : U(y) ? (e.consume(y), I) : B(y);
  }
  function M(y) {
    return y === 45 || ce(y) ? (e.consume(y), M) : y === 47 || y === 62 || Z(y) ? F(y) : n(y);
  }
  function F(y) {
    return y === 47 ? (e.consume(y), B) : y === 58 || y === 95 || de(y) ? (e.consume(y), w) : j(y) ? (s = F, K(y)) : U(y) ? (e.consume(y), F) : B(y);
  }
  function w(y) {
    return y === 45 || y === 46 || y === 58 || y === 95 || ce(y) ? (e.consume(y), w) : R(y);
  }
  function R(y) {
    return y === 61 ? (e.consume(y), D) : j(y) ? (s = R, K(y)) : U(y) ? (e.consume(y), R) : F(y);
  }
  function D(y) {
    return y === null || y === 60 || y === 61 || y === 62 || y === 96 ? n(y) : y === 34 || y === 39 ? (e.consume(y), i = y, z) : j(y) ? (s = D, K(y)) : U(y) ? (e.consume(y), D) : (e.consume(y), _);
  }
  function z(y) {
    return y === i ? (e.consume(y), i = void 0, O) : y === null ? n(y) : j(y) ? (s = z, K(y)) : (e.consume(y), z);
  }
  function _(y) {
    return y === null || y === 34 || y === 39 || y === 60 || y === 61 || y === 96 ? n(y) : y === 47 || y === 62 || Z(y) ? F(y) : (e.consume(y), _);
  }
  function O(y) {
    return y === 47 || y === 62 || Z(y) ? F(y) : n(y);
  }
  function B(y) {
    return y === 62 ? (e.consume(y), e.exit("htmlTextData"), e.exit("htmlText"), t) : n(y);
  }
  function K(y) {
    return e.exit("htmlTextData"), e.enter("lineEnding"), e.consume(y), e.exit("lineEnding"), ie;
  }
  function ie(y) {
    return U(y) ? W(e, se, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(y) : se(y);
  }
  function se(y) {
    return e.enter("htmlTextData"), s(y);
  }
}
const ur = {
  name: "labelEnd",
  resolveAll: ju,
  resolveTo: $u,
  tokenize: Bu
}, Fu = {
  tokenize: Vu
}, Mu = {
  tokenize: Hu
}, zu = {
  tokenize: Uu
};
function ju(e) {
  let t = -1;
  const n = [];
  for (; ++t < e.length; ) {
    const r = e[t][1];
    if (n.push(e[t]), r.type === "labelImage" || r.type === "labelLink" || r.type === "labelEnd") {
      const i = r.type === "labelImage" ? 4 : 2;
      r.type = "data", t += i;
    }
  }
  return e.length !== n.length && ke(e, 0, e.length, n), e;
}
function $u(e, t) {
  let n = e.length, r = 0, i, a, s, o;
  for (; n--; )
    if (i = e[n][1], a) {
      if (i.type === "link" || i.type === "labelLink" && i._inactive)
        break;
      e[n][0] === "enter" && i.type === "labelLink" && (i._inactive = !0);
    } else if (s) {
      if (e[n][0] === "enter" && (i.type === "labelImage" || i.type === "labelLink") && !i._balanced && (a = n, i.type !== "labelLink")) {
        r = 2;
        break;
      }
    } else i.type === "labelEnd" && (s = n);
  const u = {
    type: e[a][1].type === "labelLink" ? "link" : "image",
    start: {
      ...e[a][1].start
    },
    end: {
      ...e[e.length - 1][1].end
    }
  }, l = {
    type: "label",
    start: {
      ...e[a][1].start
    },
    end: {
      ...e[s][1].end
    }
  }, c = {
    type: "labelText",
    start: {
      ...e[a + r + 2][1].end
    },
    end: {
      ...e[s - 2][1].start
    }
  };
  return o = [["enter", u, t], ["enter", l, t]], o = ve(o, e.slice(a + 1, a + r + 3)), o = ve(o, [["enter", c, t]]), o = ve(o, Zt(t.parser.constructs.insideSpan.null, e.slice(a + r + 4, s - 3), t)), o = ve(o, [["exit", c, t], e[s - 2], e[s - 1], ["exit", l, t]]), o = ve(o, e.slice(s + 1)), o = ve(o, [["exit", u, t]]), ke(e, a, e.length, o), e;
}
function Bu(e, t, n) {
  const r = this;
  let i = r.events.length, a, s;
  for (; i--; )
    if ((r.events[i][1].type === "labelImage" || r.events[i][1].type === "labelLink") && !r.events[i][1]._balanced) {
      a = r.events[i][1];
      break;
    }
  return o;
  function o(h) {
    return a ? a._inactive ? f(h) : (s = r.parser.defined.includes(Ne(r.sliceSerialize({
      start: a.end,
      end: r.now()
    }))), e.enter("labelEnd"), e.enter("labelMarker"), e.consume(h), e.exit("labelMarker"), e.exit("labelEnd"), u) : n(h);
  }
  function u(h) {
    return h === 40 ? e.attempt(Fu, c, s ? c : f)(h) : h === 91 ? e.attempt(Mu, c, s ? l : f)(h) : s ? c(h) : f(h);
  }
  function l(h) {
    return e.attempt(zu, c, f)(h);
  }
  function c(h) {
    return t(h);
  }
  function f(h) {
    return a._balanced = !0, n(h);
  }
}
function Vu(e, t, n) {
  return r;
  function r(f) {
    return e.enter("resource"), e.enter("resourceMarker"), e.consume(f), e.exit("resourceMarker"), i;
  }
  function i(f) {
    return Z(f) ? St(e, a)(f) : a(f);
  }
  function a(f) {
    return f === 41 ? c(f) : Aa(e, s, o, "resourceDestination", "resourceDestinationLiteral", "resourceDestinationLiteralMarker", "resourceDestinationRaw", "resourceDestinationString", 32)(f);
  }
  function s(f) {
    return Z(f) ? St(e, u)(f) : c(f);
  }
  function o(f) {
    return n(f);
  }
  function u(f) {
    return f === 34 || f === 39 || f === 40 ? Oa(e, l, n, "resourceTitle", "resourceTitleMarker", "resourceTitleString")(f) : c(f);
  }
  function l(f) {
    return Z(f) ? St(e, c)(f) : c(f);
  }
  function c(f) {
    return f === 41 ? (e.enter("resourceMarker"), e.consume(f), e.exit("resourceMarker"), e.exit("resource"), t) : n(f);
  }
}
function Hu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return Ra.call(r, e, a, s, "reference", "referenceMarker", "referenceString")(o);
  }
  function a(o) {
    return r.parser.defined.includes(Ne(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1))) ? t(o) : n(o);
  }
  function s(o) {
    return n(o);
  }
}
function Uu(e, t, n) {
  return r;
  function r(a) {
    return e.enter("reference"), e.enter("referenceMarker"), e.consume(a), e.exit("referenceMarker"), i;
  }
  function i(a) {
    return a === 93 ? (e.enter("referenceMarker"), e.consume(a), e.exit("referenceMarker"), e.exit("reference"), t) : n(a);
  }
}
const qu = {
  name: "labelStartImage",
  resolveAll: ur.resolveAll,
  tokenize: Ku
};
function Ku(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.enter("labelImage"), e.enter("labelImageMarker"), e.consume(o), e.exit("labelImageMarker"), a;
  }
  function a(o) {
    return o === 91 ? (e.enter("labelMarker"), e.consume(o), e.exit("labelMarker"), e.exit("labelImage"), s) : n(o);
  }
  function s(o) {
    return o === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(o) : t(o);
  }
}
const Wu = {
  name: "labelStartLink",
  resolveAll: ur.resolveAll,
  tokenize: Gu
};
function Gu(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return e.enter("labelLink"), e.enter("labelMarker"), e.consume(s), e.exit("labelMarker"), e.exit("labelLink"), a;
  }
  function a(s) {
    return s === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(s) : t(s);
  }
}
const yn = {
  name: "lineEnding",
  tokenize: Ju
};
function Ju(e, t) {
  return n;
  function n(r) {
    return e.enter("lineEnding"), e.consume(r), e.exit("lineEnding"), W(e, t, "linePrefix");
  }
}
const Bt = {
  name: "thematicBreak",
  tokenize: Yu
};
function Yu(e, t, n) {
  let r = 0, i;
  return a;
  function a(l) {
    return e.enter("thematicBreak"), s(l);
  }
  function s(l) {
    return i = l, o(l);
  }
  function o(l) {
    return l === i ? (e.enter("thematicBreakSequence"), u(l)) : r >= 3 && (l === null || j(l)) ? (e.exit("thematicBreak"), t(l)) : n(l);
  }
  function u(l) {
    return l === i ? (e.consume(l), r++, u) : (e.exit("thematicBreakSequence"), U(l) ? W(e, o, "whitespace")(l) : o(l));
  }
}
const ge = {
  continuation: {
    tokenize: ec
  },
  exit: nc,
  name: "list",
  tokenize: Zu
}, Qu = {
  partial: !0,
  tokenize: rc
}, Xu = {
  partial: !0,
  tokenize: tc
};
function Zu(e, t, n) {
  const r = this, i = r.events[r.events.length - 1];
  let a = i && i[1].type === "linePrefix" ? i[2].sliceSerialize(i[1], !0).length : 0, s = 0;
  return o;
  function o(d) {
    const p = r.containerState.type || (d === 42 || d === 43 || d === 45 ? "listUnordered" : "listOrdered");
    if (p === "listUnordered" ? !r.containerState.marker || d === r.containerState.marker : Vn(d)) {
      if (r.containerState.type || (r.containerState.type = p, e.enter(p, {
        _container: !0
      })), p === "listUnordered")
        return e.enter("listItemPrefix"), d === 42 || d === 45 ? e.check(Bt, n, l)(d) : l(d);
      if (!r.interrupt || d === 49)
        return e.enter("listItemPrefix"), e.enter("listItemValue"), u(d);
    }
    return n(d);
  }
  function u(d) {
    return Vn(d) && ++s < 10 ? (e.consume(d), u) : (!r.interrupt || s < 2) && (r.containerState.marker ? d === r.containerState.marker : d === 41 || d === 46) ? (e.exit("listItemValue"), l(d)) : n(d);
  }
  function l(d) {
    return e.enter("listItemMarker"), e.consume(d), e.exit("listItemMarker"), r.containerState.marker = r.containerState.marker || d, e.check(
      Lt,
      // Can’t be empty when interrupting.
      r.interrupt ? n : c,
      e.attempt(Qu, h, f)
    );
  }
  function c(d) {
    return r.containerState.initialBlankLine = !0, a++, h(d);
  }
  function f(d) {
    return U(d) ? (e.enter("listItemPrefixWhitespace"), e.consume(d), e.exit("listItemPrefixWhitespace"), h) : n(d);
  }
  function h(d) {
    return r.containerState.size = a + r.sliceSerialize(e.exit("listItemPrefix"), !0).length, t(d);
  }
}
function ec(e, t, n) {
  const r = this;
  return r.containerState._closeFlow = void 0, e.check(Lt, i, a);
  function i(o) {
    return r.containerState.furtherBlankLines = r.containerState.furtherBlankLines || r.containerState.initialBlankLine, W(e, t, "listItemIndent", r.containerState.size + 1)(o);
  }
  function a(o) {
    return r.containerState.furtherBlankLines || !U(o) ? (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, s(o)) : (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, e.attempt(Xu, t, s)(o));
  }
  function s(o) {
    return r.containerState._closeFlow = !0, r.interrupt = void 0, W(e, e.attempt(ge, t, n), "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(o);
  }
}
function tc(e, t, n) {
  const r = this;
  return W(e, i, "listItemIndent", r.containerState.size + 1);
  function i(a) {
    const s = r.events[r.events.length - 1];
    return s && s[1].type === "listItemIndent" && s[2].sliceSerialize(s[1], !0).length === r.containerState.size ? t(a) : n(a);
  }
}
function nc(e) {
  e.exit(this.containerState.type);
}
function rc(e, t, n) {
  const r = this;
  return W(e, i, "listItemPrefixWhitespace", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 5);
  function i(a) {
    const s = r.events[r.events.length - 1];
    return !U(a) && s && s[1].type === "listItemPrefixWhitespace" ? t(a) : n(a);
  }
}
const pi = {
  name: "setextUnderline",
  resolveTo: ic,
  tokenize: ac
};
function ic(e, t) {
  let n = e.length, r, i, a;
  for (; n--; )
    if (e[n][0] === "enter") {
      if (e[n][1].type === "content") {
        r = n;
        break;
      }
      e[n][1].type === "paragraph" && (i = n);
    } else
      e[n][1].type === "content" && e.splice(n, 1), !a && e[n][1].type === "definition" && (a = n);
  const s = {
    type: "setextHeading",
    start: {
      ...e[r][1].start
    },
    end: {
      ...e[e.length - 1][1].end
    }
  };
  return e[i][1].type = "setextHeadingText", a ? (e.splice(i, 0, ["enter", s, t]), e.splice(a + 1, 0, ["exit", e[r][1], t]), e[r][1].end = {
    ...e[a][1].end
  }) : e[r][1] = s, e.push(["exit", s, t]), e;
}
function ac(e, t, n) {
  const r = this;
  let i;
  return a;
  function a(l) {
    let c = r.events.length, f;
    for (; c--; )
      if (r.events[c][1].type !== "lineEnding" && r.events[c][1].type !== "linePrefix" && r.events[c][1].type !== "content") {
        f = r.events[c][1].type === "paragraph";
        break;
      }
    return !r.parser.lazy[r.now().line] && (r.interrupt || f) ? (e.enter("setextHeadingLine"), i = l, s(l)) : n(l);
  }
  function s(l) {
    return e.enter("setextHeadingLineSequence"), o(l);
  }
  function o(l) {
    return l === i ? (e.consume(l), o) : (e.exit("setextHeadingLineSequence"), U(l) ? W(e, u, "lineSuffix")(l) : u(l));
  }
  function u(l) {
    return l === null || j(l) ? (e.exit("setextHeadingLine"), t(l)) : n(l);
  }
}
const sc = {
  tokenize: oc
};
function oc(e) {
  const t = this, n = e.attempt(
    // Try to parse a blank line.
    Lt,
    r,
    // Try to parse initial flow (essentially, only code).
    e.attempt(this.parser.constructs.flowInitial, i, W(e, e.attempt(this.parser.constructs.flow, i, e.attempt(du, i)), "linePrefix"))
  );
  return n;
  function r(a) {
    if (a === null) {
      e.consume(a);
      return;
    }
    return e.enter("lineEndingBlank"), e.consume(a), e.exit("lineEndingBlank"), t.currentConstruct = void 0, n;
  }
  function i(a) {
    if (a === null) {
      e.consume(a);
      return;
    }
    return e.enter("lineEnding"), e.consume(a), e.exit("lineEnding"), t.currentConstruct = void 0, n;
  }
}
const lc = {
  resolveAll: Da()
}, uc = Pa("string"), cc = Pa("text");
function Pa(e) {
  return {
    resolveAll: Da(e === "text" ? fc : void 0),
    tokenize: t
  };
  function t(n) {
    const r = this, i = this.parser.constructs[e], a = n.attempt(i, s, o);
    return s;
    function s(c) {
      return l(c) ? a(c) : o(c);
    }
    function o(c) {
      if (c === null) {
        n.consume(c);
        return;
      }
      return n.enter("data"), n.consume(c), u;
    }
    function u(c) {
      return l(c) ? (n.exit("data"), a(c)) : (n.consume(c), u);
    }
    function l(c) {
      if (c === null)
        return !0;
      const f = i[c];
      let h = -1;
      if (f)
        for (; ++h < f.length; ) {
          const d = f[h];
          if (!d.previous || d.previous.call(r, r.previous))
            return !0;
        }
      return !1;
    }
  }
}
function Da(e) {
  return t;
  function t(n, r) {
    let i = -1, a;
    for (; ++i <= n.length; )
      a === void 0 ? n[i] && n[i][1].type === "data" && (a = i, i++) : (!n[i] || n[i][1].type !== "data") && (i !== a + 2 && (n[a][1].end = n[i - 1][1].end, n.splice(a + 2, i - a - 2), i = a + 2), a = void 0);
    return e ? e(n, r) : n;
  }
}
function fc(e, t) {
  let n = 0;
  for (; ++n <= e.length; )
    if ((n === e.length || e[n][1].type === "lineEnding") && e[n - 1][1].type === "data") {
      const r = e[n - 1][1], i = t.sliceStream(r);
      let a = i.length, s = -1, o = 0, u;
      for (; a--; ) {
        const l = i[a];
        if (typeof l == "string") {
          for (s = l.length; l.charCodeAt(s - 1) === 32; )
            o++, s--;
          if (s) break;
          s = -1;
        } else if (l === -2)
          u = !0, o++;
        else if (l !== -1) {
          a++;
          break;
        }
      }
      if (t._contentTypeTextTrailing && n === e.length && (o = 0), o) {
        const l = {
          type: n === e.length || u || o < 2 ? "lineSuffix" : "hardBreakTrailing",
          start: {
            _bufferIndex: a ? s : r.start._bufferIndex + s,
            _index: r.start._index + a,
            line: r.end.line,
            column: r.end.column - o,
            offset: r.end.offset - o
          },
          end: {
            ...r.end
          }
        };
        r.end = {
          ...l.start
        }, r.start.offset === r.end.offset ? Object.assign(r, l) : (e.splice(n, 0, ["enter", l, t], ["exit", l, t]), n += 2);
      }
      n++;
    }
  return e;
}
const dc = {
  42: ge,
  43: ge,
  45: ge,
  48: ge,
  49: ge,
  50: ge,
  51: ge,
  52: ge,
  53: ge,
  54: ge,
  55: ge,
  56: ge,
  57: ge,
  62: Na
}, hc = {
  91: yu
}, pc = {
  [-2]: mn,
  [-1]: mn,
  32: mn
}, gc = {
  35: Su,
  42: Bt,
  45: [pi, Bt],
  60: Iu,
  61: pi,
  95: Bt,
  96: di,
  126: di
}, mc = {
  38: Ta,
  92: Ia
}, yc = {
  [-5]: yn,
  [-4]: yn,
  [-3]: yn,
  33: qu,
  38: Ta,
  42: Hn,
  60: [Wl, Du],
  91: Wu,
  92: [vu, Ia],
  93: ur,
  95: Hn,
  96: su
}, bc = {
  null: [Hn, lc]
}, xc = {
  null: [42, 95]
}, kc = {
  null: []
}, vc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  attentionMarkers: xc,
  contentInitial: hc,
  disable: kc,
  document: dc,
  flow: gc,
  flowInitial: pc,
  insideSpan: bc,
  string: mc,
  text: yc
}, Symbol.toStringTag, { value: "Module" }));
function wc(e, t, n) {
  let r = {
    _bufferIndex: -1,
    _index: 0,
    line: n && n.line || 1,
    column: n && n.column || 1,
    offset: n && n.offset || 0
  };
  const i = {}, a = [];
  let s = [], o = [];
  const u = {
    attempt: I(A),
    check: I(b),
    consume: S,
    enter: C,
    exit: N,
    interrupt: I(b, {
      interrupt: !0
    })
  }, l = {
    code: null,
    containerState: {},
    defineSkip: m,
    events: [],
    now: p,
    parser: e,
    previous: null,
    sliceSerialize: h,
    sliceStream: d,
    write: f
  };
  let c = t.tokenize.call(l, u);
  return t.resolveAll && a.push(t), l;
  function f(R) {
    return s = ve(s, R), v(), s[s.length - 1] !== null ? [] : (M(t, 0), l.events = Zt(a, l.events, l), l.events);
  }
  function h(R, D) {
    return Cc(d(R), D);
  }
  function d(R) {
    return Sc(s, R);
  }
  function p() {
    const {
      _bufferIndex: R,
      _index: D,
      line: z,
      column: _,
      offset: O
    } = r;
    return {
      _bufferIndex: R,
      _index: D,
      line: z,
      column: _,
      offset: O
    };
  }
  function m(R) {
    i[R.line] = R.column, w();
  }
  function v() {
    let R;
    for (; r._index < s.length; ) {
      const D = s[r._index];
      if (typeof D == "string")
        for (R = r._index, r._bufferIndex < 0 && (r._bufferIndex = 0); r._index === R && r._bufferIndex < D.length; )
          k(D.charCodeAt(r._bufferIndex));
      else
        k(D);
    }
  }
  function k(R) {
    c = c(R);
  }
  function S(R) {
    j(R) ? (r.line++, r.column = 1, r.offset += R === -3 ? 2 : 1, w()) : R !== -1 && (r.column++, r.offset++), r._bufferIndex < 0 ? r._index++ : (r._bufferIndex++, r._bufferIndex === // Points w/ non-negative `_bufferIndex` reference
    // strings.
    /** @type {string} */
    s[r._index].length && (r._bufferIndex = -1, r._index++)), l.previous = R;
  }
  function C(R, D) {
    const z = D || {};
    return z.type = R, z.start = p(), l.events.push(["enter", z, l]), o.push(z), z;
  }
  function N(R) {
    const D = o.pop();
    return D.end = p(), l.events.push(["exit", D, l]), D;
  }
  function A(R, D) {
    M(R, D.from);
  }
  function b(R, D) {
    D.restore();
  }
  function I(R, D) {
    return z;
    function z(_, O, B) {
      let K, ie, se, y;
      return Array.isArray(_) ? (
        /* c8 ignore next 1 */
        oe(_)
      ) : "tokenize" in _ ? (
        // Looks like a construct.
        oe([
          /** @type {Construct} */
          _
        ])
      ) : G(_);
      function G(le) {
        return ut;
        function ut(Me) {
          const Xe = Me !== null && le[Me], Ze = Me !== null && le.null, Rt = [
            // To do: add more extension tests.
            /* c8 ignore next 2 */
            ...Array.isArray(Xe) ? Xe : Xe ? [Xe] : [],
            ...Array.isArray(Ze) ? Ze : Ze ? [Ze] : []
          ];
          return oe(Rt)(Me);
        }
      }
      function oe(le) {
        return K = le, ie = 0, le.length === 0 ? B : x(le[ie]);
      }
      function x(le) {
        return ut;
        function ut(Me) {
          return y = F(), se = le, le.partial || (l.currentConstruct = le), le.name && l.parser.constructs.disable.null.includes(le.name) ? Ve() : le.tokenize.call(
            // If we do have fields, create an object w/ `context` as its
            // prototype.
            // This allows a “live binding”, which is needed for `interrupt`.
            D ? Object.assign(Object.create(l), D) : l,
            u,
            pe,
            Ve
          )(Me);
        }
      }
      function pe(le) {
        return R(se, y), O;
      }
      function Ve(le) {
        return y.restore(), ++ie < K.length ? x(K[ie]) : B;
      }
    }
  }
  function M(R, D) {
    R.resolveAll && !a.includes(R) && a.push(R), R.resolve && ke(l.events, D, l.events.length - D, R.resolve(l.events.slice(D), l)), R.resolveTo && (l.events = R.resolveTo(l.events, l));
  }
  function F() {
    const R = p(), D = l.previous, z = l.currentConstruct, _ = l.events.length, O = Array.from(o);
    return {
      from: _,
      restore: B
    };
    function B() {
      r = R, l.previous = D, l.currentConstruct = z, l.events.length = _, o = O, w();
    }
  }
  function w() {
    r.line in i && r.column < 2 && (r.column = i[r.line], r.offset += i[r.line] - 1);
  }
}
function Sc(e, t) {
  const n = t.start._index, r = t.start._bufferIndex, i = t.end._index, a = t.end._bufferIndex;
  let s;
  if (n === i)
    s = [e[n].slice(r, a)];
  else {
    if (s = e.slice(n, i), r > -1) {
      const o = s[0];
      typeof o == "string" ? s[0] = o.slice(r) : s.shift();
    }
    a > 0 && s.push(e[i].slice(0, a));
  }
  return s;
}
function Cc(e, t) {
  let n = -1;
  const r = [];
  let i;
  for (; ++n < e.length; ) {
    const a = e[n];
    let s;
    if (typeof a == "string")
      s = a;
    else switch (a) {
      case -5: {
        s = "\r";
        break;
      }
      case -4: {
        s = `
`;
        break;
      }
      case -3: {
        s = `\r
`;
        break;
      }
      case -2: {
        s = t ? " " : "	";
        break;
      }
      case -1: {
        if (!t && i) continue;
        s = " ";
        break;
      }
      default:
        s = String.fromCharCode(a);
    }
    i = a === -2, r.push(s);
  }
  return r.join("");
}
function Ec(e) {
  const r = {
    constructs: (
      /** @type {FullNormalizedExtension} */
      Ca([vc, ...(e || {}).extensions || []])
    ),
    content: i($l),
    defined: [],
    document: i(Vl),
    flow: i(sc),
    lazy: {},
    string: i(uc),
    text: i(cc)
  };
  return r;
  function i(a) {
    return s;
    function s(o) {
      return wc(r, a, o);
    }
  }
}
function Nc(e) {
  for (; !La(e); )
    ;
  return e;
}
const gi = /[\0\t\n\r]/g;
function Ic() {
  let e = 1, t = "", n = !0, r;
  return i;
  function i(a, s, o) {
    const u = [];
    let l, c, f, h, d;
    for (a = t + (typeof a == "string" ? a.toString() : new TextDecoder(s || void 0).decode(a)), f = 0, t = "", n && (a.charCodeAt(0) === 65279 && f++, n = void 0); f < a.length; ) {
      if (gi.lastIndex = f, l = gi.exec(a), h = l && l.index !== void 0 ? l.index : a.length, d = a.charCodeAt(h), !l) {
        t = a.slice(f);
        break;
      }
      if (d === 10 && f === h && r)
        u.push(-3), r = void 0;
      else
        switch (r && (u.push(-5), r = void 0), f < h && (u.push(a.slice(f, h)), e += h - f), d) {
          case 0: {
            u.push(65533), e++;
            break;
          }
          case 9: {
            for (c = Math.ceil(e / 4) * 4, u.push(-2); e++ < c; ) u.push(-1);
            break;
          }
          case 10: {
            u.push(-4), e = 1;
            break;
          }
          default:
            r = !0, e = 1;
        }
      f = h + 1;
    }
    return o && (r && u.push(-5), t && u.push(t), u.push(null)), u;
  }
}
const Tc = /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;
function Lc(e) {
  return e.replace(Tc, Ac);
}
function Ac(e, t, n) {
  if (t)
    return t;
  if (n.charCodeAt(0) === 35) {
    const i = n.charCodeAt(1), a = i === 120 || i === 88;
    return Ea(n.slice(a ? 2 : 1), a ? 16 : 10);
  }
  return lr(n) || e;
}
const _a = {}.hasOwnProperty;
function Rc(e, t, n) {
  return t && typeof t == "object" && (n = t, t = void 0), Oc(n)(Nc(Ec(n).document().write(Ic()(e, t, !0))));
}
function Oc(e) {
  const t = {
    transforms: [],
    canContainEols: ["emphasis", "fragment", "heading", "paragraph", "strong"],
    enter: {
      autolink: a(Sr),
      autolinkProtocol: F,
      autolinkEmail: F,
      atxHeading: a(kr),
      blockQuote: a(Ze),
      characterEscape: F,
      characterReference: F,
      codeFenced: a(Rt),
      codeFencedFenceInfo: s,
      codeFencedFenceMeta: s,
      codeIndented: a(Rt, s),
      codeText: a(ks, s),
      codeTextData: F,
      data: F,
      codeFlowValue: F,
      definition: a(vs),
      definitionDestinationString: s,
      definitionLabelString: s,
      definitionTitleString: s,
      emphasis: a(ws),
      hardBreakEscape: a(vr),
      hardBreakTrailing: a(vr),
      htmlFlow: a(wr, s),
      htmlFlowData: F,
      htmlText: a(wr, s),
      htmlTextData: F,
      image: a(Ss),
      label: s,
      link: a(Sr),
      listItem: a(Cs),
      listItemValue: h,
      listOrdered: a(Cr, f),
      listUnordered: a(Cr),
      paragraph: a(Es),
      reference: x,
      referenceString: s,
      resourceDestinationString: s,
      resourceTitleString: s,
      setextHeading: a(kr),
      strong: a(Ns),
      thematicBreak: a(Ts)
    },
    exit: {
      atxHeading: u(),
      atxHeadingSequence: A,
      autolink: u(),
      autolinkEmail: Xe,
      autolinkProtocol: Me,
      blockQuote: u(),
      characterEscapeValue: w,
      characterReferenceMarkerHexadecimal: Ve,
      characterReferenceMarkerNumeric: Ve,
      characterReferenceValue: le,
      characterReference: ut,
      codeFenced: u(v),
      codeFencedFence: m,
      codeFencedFenceInfo: d,
      codeFencedFenceMeta: p,
      codeFlowValue: w,
      codeIndented: u(k),
      codeText: u(O),
      codeTextData: w,
      data: w,
      definition: u(),
      definitionDestinationString: N,
      definitionLabelString: S,
      definitionTitleString: C,
      emphasis: u(),
      hardBreakEscape: u(D),
      hardBreakTrailing: u(D),
      htmlFlow: u(z),
      htmlFlowData: w,
      htmlText: u(_),
      htmlTextData: w,
      image: u(K),
      label: se,
      labelText: ie,
      lineEnding: R,
      link: u(B),
      listItem: u(),
      listOrdered: u(),
      listUnordered: u(),
      paragraph: u(),
      referenceString: pe,
      resourceDestinationString: y,
      resourceTitleString: G,
      resource: oe,
      setextHeading: u(M),
      setextHeadingLineSequence: I,
      setextHeadingText: b,
      strong: u(),
      thematicBreak: u()
    }
  };
  Fa(t, (e || {}).mdastExtensions || []);
  const n = {};
  return r;
  function r(E) {
    let P = {
      type: "root",
      children: []
    };
    const H = {
      stack: [P],
      tokenStack: [],
      config: t,
      enter: o,
      exit: l,
      buffer: s,
      resume: c,
      data: n
    }, q = [];
    let Q = -1;
    for (; ++Q < E.length; )
      if (E[Q][1].type === "listOrdered" || E[Q][1].type === "listUnordered")
        if (E[Q][0] === "enter")
          q.push(Q);
        else {
          const Ee = q.pop();
          Q = i(E, Ee, Q);
        }
    for (Q = -1; ++Q < E.length; ) {
      const Ee = t[E[Q][0]];
      _a.call(Ee, E[Q][1].type) && Ee[E[Q][1].type].call(Object.assign({
        sliceSerialize: E[Q][2].sliceSerialize
      }, H), E[Q][1]);
    }
    if (H.tokenStack.length > 0) {
      const Ee = H.tokenStack[H.tokenStack.length - 1];
      (Ee[1] || mi).call(H, void 0, Ee[0]);
    }
    for (P.position = {
      start: ze(E.length > 0 ? E[0][1].start : {
        line: 1,
        column: 1,
        offset: 0
      }),
      end: ze(E.length > 0 ? E[E.length - 2][1].end : {
        line: 1,
        column: 1,
        offset: 0
      })
    }, Q = -1; ++Q < t.transforms.length; )
      P = t.transforms[Q](P) || P;
    return P;
  }
  function i(E, P, H) {
    let q = P - 1, Q = -1, Ee = !1, He, Re, ct, ft;
    for (; ++q <= H; ) {
      const ye = E[q];
      switch (ye[1].type) {
        case "listUnordered":
        case "listOrdered":
        case "blockQuote": {
          ye[0] === "enter" ? Q++ : Q--, ft = void 0;
          break;
        }
        case "lineEndingBlank": {
          ye[0] === "enter" && (He && !ft && !Q && !ct && (ct = q), ft = void 0);
          break;
        }
        case "linePrefix":
        case "listItemValue":
        case "listItemMarker":
        case "listItemPrefix":
        case "listItemPrefixWhitespace":
          break;
        default:
          ft = void 0;
      }
      if (!Q && ye[0] === "enter" && ye[1].type === "listItemPrefix" || Q === -1 && ye[0] === "exit" && (ye[1].type === "listUnordered" || ye[1].type === "listOrdered")) {
        if (He) {
          let et = q;
          for (Re = void 0; et--; ) {
            const Oe = E[et];
            if (Oe[1].type === "lineEnding" || Oe[1].type === "lineEndingBlank") {
              if (Oe[0] === "exit") continue;
              Re && (E[Re][1].type = "lineEndingBlank", Ee = !0), Oe[1].type = "lineEnding", Re = et;
            } else if (!(Oe[1].type === "linePrefix" || Oe[1].type === "blockQuotePrefix" || Oe[1].type === "blockQuotePrefixWhitespace" || Oe[1].type === "blockQuoteMarker" || Oe[1].type === "listItemIndent")) break;
          }
          ct && (!Re || ct < Re) && (He._spread = !0), He.end = Object.assign({}, Re ? E[Re][1].start : ye[1].end), E.splice(Re || q, 0, ["exit", He, ye[2]]), q++, H++;
        }
        if (ye[1].type === "listItemPrefix") {
          const et = {
            type: "listItem",
            _spread: !1,
            start: Object.assign({}, ye[1].start),
            // @ts-expect-error: we’ll add `end` in a second.
            end: void 0
          };
          He = et, E.splice(q, 0, ["enter", et, ye[2]]), q++, H++, ct = void 0, ft = !0;
        }
      }
    }
    return E[P][1]._spread = Ee, H;
  }
  function a(E, P) {
    return H;
    function H(q) {
      o.call(this, E(q), q), P && P.call(this, q);
    }
  }
  function s() {
    this.stack.push({
      type: "fragment",
      children: []
    });
  }
  function o(E, P, H) {
    this.stack[this.stack.length - 1].children.push(E), this.stack.push(E), this.tokenStack.push([P, H || void 0]), E.position = {
      start: ze(P.start),
      // @ts-expect-error: `end` will be patched later.
      end: void 0
    };
  }
  function u(E) {
    return P;
    function P(H) {
      E && E.call(this, H), l.call(this, H);
    }
  }
  function l(E, P) {
    const H = this.stack.pop(), q = this.tokenStack.pop();
    if (q)
      q[0].type !== E.type && (P ? P.call(this, E, q[0]) : (q[1] || mi).call(this, E, q[0]));
    else throw new Error("Cannot close `" + E.type + "` (" + wt({
      start: E.start,
      end: E.end
    }) + "): it’s not open");
    H.position.end = ze(E.end);
  }
  function c() {
    return or(this.stack.pop());
  }
  function f() {
    this.data.expectingFirstListItemValue = !0;
  }
  function h(E) {
    if (this.data.expectingFirstListItemValue) {
      const P = this.stack[this.stack.length - 2];
      P.start = Number.parseInt(this.sliceSerialize(E), 10), this.data.expectingFirstListItemValue = void 0;
    }
  }
  function d() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.lang = E;
  }
  function p() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.meta = E;
  }
  function m() {
    this.data.flowCodeInside || (this.buffer(), this.data.flowCodeInside = !0);
  }
  function v() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = E.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, ""), this.data.flowCodeInside = void 0;
  }
  function k() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = E.replace(/(\r?\n|\r)$/g, "");
  }
  function S(E) {
    const P = this.resume(), H = this.stack[this.stack.length - 1];
    H.label = P, H.identifier = Ne(this.sliceSerialize(E)).toLowerCase();
  }
  function C() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.title = E;
  }
  function N() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.url = E;
  }
  function A(E) {
    const P = this.stack[this.stack.length - 1];
    if (!P.depth) {
      const H = this.sliceSerialize(E).length;
      P.depth = H;
    }
  }
  function b() {
    this.data.setextHeadingSlurpLineEnding = !0;
  }
  function I(E) {
    const P = this.stack[this.stack.length - 1];
    P.depth = this.sliceSerialize(E).codePointAt(0) === 61 ? 1 : 2;
  }
  function M() {
    this.data.setextHeadingSlurpLineEnding = void 0;
  }
  function F(E) {
    const H = this.stack[this.stack.length - 1].children;
    let q = H[H.length - 1];
    (!q || q.type !== "text") && (q = Is(), q.position = {
      start: ze(E.start),
      // @ts-expect-error: we’ll add `end` later.
      end: void 0
    }, H.push(q)), this.stack.push(q);
  }
  function w(E) {
    const P = this.stack.pop();
    P.value += this.sliceSerialize(E), P.position.end = ze(E.end);
  }
  function R(E) {
    const P = this.stack[this.stack.length - 1];
    if (this.data.atHardBreak) {
      const H = P.children[P.children.length - 1];
      H.position.end = ze(E.end), this.data.atHardBreak = void 0;
      return;
    }
    !this.data.setextHeadingSlurpLineEnding && t.canContainEols.includes(P.type) && (F.call(this, E), w.call(this, E));
  }
  function D() {
    this.data.atHardBreak = !0;
  }
  function z() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = E;
  }
  function _() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = E;
  }
  function O() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = E;
  }
  function B() {
    const E = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const P = this.data.referenceType || "shortcut";
      E.type += "Reference", E.referenceType = P, delete E.url, delete E.title;
    } else
      delete E.identifier, delete E.label;
    this.data.referenceType = void 0;
  }
  function K() {
    const E = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const P = this.data.referenceType || "shortcut";
      E.type += "Reference", E.referenceType = P, delete E.url, delete E.title;
    } else
      delete E.identifier, delete E.label;
    this.data.referenceType = void 0;
  }
  function ie(E) {
    const P = this.sliceSerialize(E), H = this.stack[this.stack.length - 2];
    H.label = Lc(P), H.identifier = Ne(P).toLowerCase();
  }
  function se() {
    const E = this.stack[this.stack.length - 1], P = this.resume(), H = this.stack[this.stack.length - 1];
    if (this.data.inReference = !0, H.type === "link") {
      const q = E.children;
      H.children = q;
    } else
      H.alt = P;
  }
  function y() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.url = E;
  }
  function G() {
    const E = this.resume(), P = this.stack[this.stack.length - 1];
    P.title = E;
  }
  function oe() {
    this.data.inReference = void 0;
  }
  function x() {
    this.data.referenceType = "collapsed";
  }
  function pe(E) {
    const P = this.resume(), H = this.stack[this.stack.length - 1];
    H.label = P, H.identifier = Ne(this.sliceSerialize(E)).toLowerCase(), this.data.referenceType = "full";
  }
  function Ve(E) {
    this.data.characterReferenceType = E.type;
  }
  function le(E) {
    const P = this.sliceSerialize(E), H = this.data.characterReferenceType;
    let q;
    H ? (q = Ea(P, H === "characterReferenceMarkerNumeric" ? 10 : 16), this.data.characterReferenceType = void 0) : q = lr(P);
    const Q = this.stack[this.stack.length - 1];
    Q.value += q;
  }
  function ut(E) {
    const P = this.stack.pop();
    P.position.end = ze(E.end);
  }
  function Me(E) {
    w.call(this, E);
    const P = this.stack[this.stack.length - 1];
    P.url = this.sliceSerialize(E);
  }
  function Xe(E) {
    w.call(this, E);
    const P = this.stack[this.stack.length - 1];
    P.url = "mailto:" + this.sliceSerialize(E);
  }
  function Ze() {
    return {
      type: "blockquote",
      children: []
    };
  }
  function Rt() {
    return {
      type: "code",
      lang: null,
      meta: null,
      value: ""
    };
  }
  function ks() {
    return {
      type: "inlineCode",
      value: ""
    };
  }
  function vs() {
    return {
      type: "definition",
      identifier: "",
      label: null,
      title: null,
      url: ""
    };
  }
  function ws() {
    return {
      type: "emphasis",
      children: []
    };
  }
  function kr() {
    return {
      type: "heading",
      // @ts-expect-error `depth` will be set later.
      depth: 0,
      children: []
    };
  }
  function vr() {
    return {
      type: "break"
    };
  }
  function wr() {
    return {
      type: "html",
      value: ""
    };
  }
  function Ss() {
    return {
      type: "image",
      title: null,
      url: "",
      alt: null
    };
  }
  function Sr() {
    return {
      type: "link",
      title: null,
      url: "",
      children: []
    };
  }
  function Cr(E) {
    return {
      type: "list",
      ordered: E.type === "listOrdered",
      start: null,
      spread: E._spread,
      children: []
    };
  }
  function Cs(E) {
    return {
      type: "listItem",
      spread: E._spread,
      checked: null,
      children: []
    };
  }
  function Es() {
    return {
      type: "paragraph",
      children: []
    };
  }
  function Ns() {
    return {
      type: "strong",
      children: []
    };
  }
  function Is() {
    return {
      type: "text",
      value: ""
    };
  }
  function Ts() {
    return {
      type: "thematicBreak"
    };
  }
}
function ze(e) {
  return {
    line: e.line,
    column: e.column,
    offset: e.offset
  };
}
function Fa(e, t) {
  let n = -1;
  for (; ++n < t.length; ) {
    const r = t[n];
    Array.isArray(r) ? Fa(e, r) : Pc(e, r);
  }
}
function Pc(e, t) {
  let n;
  for (n in t)
    if (_a.call(t, n))
      switch (n) {
        case "canContainEols": {
          const r = t[n];
          r && e[n].push(...r);
          break;
        }
        case "transforms": {
          const r = t[n];
          r && e[n].push(...r);
          break;
        }
        case "enter":
        case "exit": {
          const r = t[n];
          r && Object.assign(e[n], r);
          break;
        }
      }
}
function mi(e, t) {
  throw e ? new Error("Cannot close `" + e.type + "` (" + wt({
    start: e.start,
    end: e.end
  }) + "): a different token (`" + t.type + "`, " + wt({
    start: t.start,
    end: t.end
  }) + ") is open") : new Error("Cannot close document, a token (`" + t.type + "`, " + wt({
    start: t.start,
    end: t.end
  }) + ") is still open");
}
function Dc(e) {
  const t = this;
  t.parser = n;
  function n(r) {
    return Rc(r, {
      ...t.data("settings"),
      ...e,
      // Note: these options are not in the readme.
      // The goal is for them to be set by plugins on `data` instead of being
      // passed by users.
      extensions: t.data("micromarkExtensions") || [],
      mdastExtensions: t.data("fromMarkdownExtensions") || []
    });
  }
}
function _c(e, t) {
  const n = {
    type: "element",
    tagName: "blockquote",
    properties: {},
    children: e.wrap(e.all(t), !0)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Fc(e, t) {
  const n = { type: "element", tagName: "br", properties: {}, children: [] };
  return e.patch(t, n), [e.applyData(t, n), { type: "text", value: `
` }];
}
function Mc(e, t) {
  const n = t.value ? t.value + `
` : "", r = {}, i = t.lang ? t.lang.split(/\s+/) : [];
  i.length > 0 && (r.className = ["language-" + i[0]]);
  let a = {
    type: "element",
    tagName: "code",
    properties: r,
    children: [{ type: "text", value: n }]
  };
  return t.meta && (a.data = { meta: t.meta }), e.patch(t, a), a = e.applyData(t, a), a = { type: "element", tagName: "pre", properties: {}, children: [a] }, e.patch(t, a), a;
}
function zc(e, t) {
  const n = {
    type: "element",
    tagName: "del",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function jc(e, t) {
  const n = {
    type: "element",
    tagName: "em",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function $c(e, t) {
  const n = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", r = String(t.identifier).toUpperCase(), i = lt(r.toLowerCase()), a = e.footnoteOrder.indexOf(r);
  let s, o = e.footnoteCounts.get(r);
  o === void 0 ? (o = 0, e.footnoteOrder.push(r), s = e.footnoteOrder.length) : s = a + 1, o += 1, e.footnoteCounts.set(r, o);
  const u = {
    type: "element",
    tagName: "a",
    properties: {
      href: "#" + n + "fn-" + i,
      id: n + "fnref-" + i + (o > 1 ? "-" + o : ""),
      dataFootnoteRef: !0,
      ariaDescribedBy: ["footnote-label"]
    },
    children: [{ type: "text", value: String(s) }]
  };
  e.patch(t, u);
  const l = {
    type: "element",
    tagName: "sup",
    properties: {},
    children: [u]
  };
  return e.patch(t, l), e.applyData(t, l);
}
function Bc(e, t) {
  const n = {
    type: "element",
    tagName: "h" + t.depth,
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Vc(e, t) {
  if (e.options.allowDangerousHtml) {
    const n = { type: "raw", value: t.value };
    return e.patch(t, n), e.applyData(t, n);
  }
}
function Ma(e, t) {
  const n = t.referenceType;
  let r = "]";
  if (n === "collapsed" ? r += "[]" : n === "full" && (r += "[" + (t.label || t.identifier) + "]"), t.type === "imageReference")
    return [{ type: "text", value: "![" + t.alt + r }];
  const i = e.all(t), a = i[0];
  a && a.type === "text" ? a.value = "[" + a.value : i.unshift({ type: "text", value: "[" });
  const s = i[i.length - 1];
  return s && s.type === "text" ? s.value += r : i.push({ type: "text", value: r }), i;
}
function Hc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return Ma(e, t);
  const i = { src: lt(r.url || ""), alt: t.alt };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const a = { type: "element", tagName: "img", properties: i, children: [] };
  return e.patch(t, a), e.applyData(t, a);
}
function Uc(e, t) {
  const n = { src: lt(t.url) };
  t.alt !== null && t.alt !== void 0 && (n.alt = t.alt), t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = { type: "element", tagName: "img", properties: n, children: [] };
  return e.patch(t, r), e.applyData(t, r);
}
function qc(e, t) {
  const n = { type: "text", value: t.value.replace(/\r?\n|\r/g, " ") };
  e.patch(t, n);
  const r = {
    type: "element",
    tagName: "code",
    properties: {},
    children: [n]
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Kc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return Ma(e, t);
  const i = { href: lt(r.url || "") };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const a = {
    type: "element",
    tagName: "a",
    properties: i,
    children: e.all(t)
  };
  return e.patch(t, a), e.applyData(t, a);
}
function Wc(e, t) {
  const n = { href: lt(t.url) };
  t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = {
    type: "element",
    tagName: "a",
    properties: n,
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Gc(e, t, n) {
  const r = e.all(t), i = n ? Jc(n) : za(t), a = {}, s = [];
  if (typeof t.checked == "boolean") {
    const c = r[0];
    let f;
    c && c.type === "element" && c.tagName === "p" ? f = c : (f = { type: "element", tagName: "p", properties: {}, children: [] }, r.unshift(f)), f.children.length > 0 && f.children.unshift({ type: "text", value: " " }), f.children.unshift({
      type: "element",
      tagName: "input",
      properties: { type: "checkbox", checked: t.checked, disabled: !0 },
      children: []
    }), a.className = ["task-list-item"];
  }
  let o = -1;
  for (; ++o < r.length; ) {
    const c = r[o];
    (i || o !== 0 || c.type !== "element" || c.tagName !== "p") && s.push({ type: "text", value: `
` }), c.type === "element" && c.tagName === "p" && !i ? s.push(...c.children) : s.push(c);
  }
  const u = r[r.length - 1];
  u && (i || u.type !== "element" || u.tagName !== "p") && s.push({ type: "text", value: `
` });
  const l = { type: "element", tagName: "li", properties: a, children: s };
  return e.patch(t, l), e.applyData(t, l);
}
function Jc(e) {
  let t = !1;
  if (e.type === "list") {
    t = e.spread || !1;
    const n = e.children;
    let r = -1;
    for (; !t && ++r < n.length; )
      t = za(n[r]);
  }
  return t;
}
function za(e) {
  const t = e.spread;
  return t ?? e.children.length > 1;
}
function Yc(e, t) {
  const n = {}, r = e.all(t);
  let i = -1;
  for (typeof t.start == "number" && t.start !== 1 && (n.start = t.start); ++i < r.length; ) {
    const s = r[i];
    if (s.type === "element" && s.tagName === "li" && s.properties && Array.isArray(s.properties.className) && s.properties.className.includes("task-list-item")) {
      n.className = ["contains-task-list"];
      break;
    }
  }
  const a = {
    type: "element",
    tagName: t.ordered ? "ol" : "ul",
    properties: n,
    children: e.wrap(r, !0)
  };
  return e.patch(t, a), e.applyData(t, a);
}
function Qc(e, t) {
  const n = {
    type: "element",
    tagName: "p",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Xc(e, t) {
  const n = { type: "root", children: e.wrap(e.all(t)) };
  return e.patch(t, n), e.applyData(t, n);
}
function Zc(e, t) {
  const n = {
    type: "element",
    tagName: "strong",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function ef(e, t) {
  const n = e.all(t), r = n.shift(), i = [];
  if (r) {
    const s = {
      type: "element",
      tagName: "thead",
      properties: {},
      children: e.wrap([r], !0)
    };
    e.patch(t.children[0], s), i.push(s);
  }
  if (n.length > 0) {
    const s = {
      type: "element",
      tagName: "tbody",
      properties: {},
      children: e.wrap(n, !0)
    }, o = rr(t.children[1]), u = ya(t.children[t.children.length - 1]);
    o && u && (s.position = { start: o, end: u }), i.push(s);
  }
  const a = {
    type: "element",
    tagName: "table",
    properties: {},
    children: e.wrap(i, !0)
  };
  return e.patch(t, a), e.applyData(t, a);
}
function tf(e, t, n) {
  const r = n ? n.children : void 0, a = (r ? r.indexOf(t) : 1) === 0 ? "th" : "td", s = n && n.type === "table" ? n.align : void 0, o = s ? s.length : t.children.length;
  let u = -1;
  const l = [];
  for (; ++u < o; ) {
    const f = t.children[u], h = {}, d = s ? s[u] : void 0;
    d && (h.align = d);
    let p = { type: "element", tagName: a, properties: h, children: [] };
    f && (p.children = e.all(f), e.patch(f, p), p = e.applyData(f, p)), l.push(p);
  }
  const c = {
    type: "element",
    tagName: "tr",
    properties: {},
    children: e.wrap(l, !0)
  };
  return e.patch(t, c), e.applyData(t, c);
}
function nf(e, t) {
  const n = {
    type: "element",
    tagName: "td",
    // Assume body cell.
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
const yi = 9, bi = 32;
function rf(e) {
  const t = String(e), n = /\r?\n|\r/g;
  let r = n.exec(t), i = 0;
  const a = [];
  for (; r; )
    a.push(
      xi(t.slice(i, r.index), i > 0, !0),
      r[0]
    ), i = r.index + r[0].length, r = n.exec(t);
  return a.push(xi(t.slice(i), i > 0, !1)), a.join("");
}
function xi(e, t, n) {
  let r = 0, i = e.length;
  if (t) {
    let a = e.codePointAt(r);
    for (; a === yi || a === bi; )
      r++, a = e.codePointAt(r);
  }
  if (n) {
    let a = e.codePointAt(i - 1);
    for (; a === yi || a === bi; )
      i--, a = e.codePointAt(i - 1);
  }
  return i > r ? e.slice(r, i) : "";
}
function af(e, t) {
  const n = { type: "text", value: rf(String(t.value)) };
  return e.patch(t, n), e.applyData(t, n);
}
function sf(e, t) {
  const n = {
    type: "element",
    tagName: "hr",
    properties: {},
    children: []
  };
  return e.patch(t, n), e.applyData(t, n);
}
const of = {
  blockquote: _c,
  break: Fc,
  code: Mc,
  delete: zc,
  emphasis: jc,
  footnoteReference: $c,
  heading: Bc,
  html: Vc,
  imageReference: Hc,
  image: Uc,
  inlineCode: qc,
  linkReference: Kc,
  link: Wc,
  listItem: Gc,
  list: Yc,
  paragraph: Qc,
  // @ts-expect-error: root is different, but hard to type.
  root: Xc,
  strong: Zc,
  table: ef,
  tableCell: nf,
  tableRow: tf,
  text: af,
  thematicBreak: sf,
  toml: Dt,
  yaml: Dt,
  definition: Dt,
  footnoteDefinition: Dt
};
function Dt() {
}
const ja = -1, en = 0, Ct = 1, Kt = 2, cr = 3, fr = 4, dr = 5, hr = 6, $a = 7, Ba = 8, Va = typeof self == "object" ? self : globalThis, ki = (e, t) => {
  switch (e) {
    case "Function":
    case "SharedWorker":
    case "Worker":
    case "eval":
    case "setInterval":
    case "setTimeout":
      throw new TypeError("unable to deserialize " + e);
  }
  return new Va[e](t);
}, lf = (e, t) => {
  const n = (i, a) => (e.set(a, i), i), r = (i) => {
    if (e.has(i))
      return e.get(i);
    const [a, s] = t[i];
    switch (a) {
      case en:
      case ja:
        return n(s, i);
      case Ct: {
        const o = n([], i);
        for (const u of s)
          o.push(r(u));
        return o;
      }
      case Kt: {
        const o = n({}, i);
        for (const [u, l] of s)
          o[r(u)] = r(l);
        return o;
      }
      case cr:
        return n(new Date(s), i);
      case fr: {
        const { source: o, flags: u } = s;
        return n(new RegExp(o, u), i);
      }
      case dr: {
        const o = n(/* @__PURE__ */ new Map(), i);
        for (const [u, l] of s)
          o.set(r(u), r(l));
        return o;
      }
      case hr: {
        const o = n(/* @__PURE__ */ new Set(), i);
        for (const u of s)
          o.add(r(u));
        return o;
      }
      case $a: {
        const { name: o, message: u } = s;
        return n(
          typeof Va[o] == "function" ? ki(o, u) : new Error(u),
          i
        );
      }
      case Ba:
        return n(BigInt(s), i);
      case "BigInt":
        return n(Object(BigInt(s)), i);
      case "ArrayBuffer":
        return n(new Uint8Array(s).buffer, s);
      case "DataView": {
        const { buffer: o } = new Uint8Array(s);
        return n(new DataView(o), s);
      }
    }
    return n(ki(a, s), i);
  };
  return r;
}, vi = (e) => lf(/* @__PURE__ */ new Map(), e)(0), qe = "", { toString: uf } = {}, { keys: cf } = Object, bt = (e) => {
  const t = typeof e;
  if (t !== "object" || !e)
    return [en, t];
  const n = uf.call(e).slice(8, -1);
  switch (n) {
    case "Array":
      return [Ct, qe];
    case "Object":
      return [Kt, qe];
    case "Date":
      return [cr, qe];
    case "RegExp":
      return [fr, qe];
    case "Map":
      return [dr, qe];
    case "Set":
      return [hr, qe];
    case "DataView":
      return [Ct, n];
  }
  return n.includes("Array") ? [Ct, n] : e instanceof Error ? [$a, e.name || "Error"] : [Kt, n];
}, _t = ([e, t]) => e === en && (t === "function" || t === "symbol"), ff = (e, t, n, r) => {
  const i = (s, o) => {
    const u = r.push(s) - 1;
    return n.set(o, u), u;
  }, a = (s) => {
    if (n.has(s))
      return n.get(s);
    let [o, u] = bt(s);
    switch (o) {
      case en: {
        let c = s;
        switch (u) {
          case "bigint":
            o = Ba, c = s.toString();
            break;
          case "function":
          case "symbol":
            if (e)
              throw new TypeError("unable to serialize " + u);
            c = null;
            break;
          case "undefined":
            return i([ja], s);
        }
        return i([o, c], s);
      }
      case Ct: {
        if (u) {
          let h = s;
          return u === "DataView" ? h = new Uint8Array(s.buffer) : u === "ArrayBuffer" && (h = new Uint8Array(s)), i([u, [...h]], s);
        }
        const c = [], f = i([o, c], s);
        for (const h of s)
          c.push(a(h));
        return f;
      }
      case Kt: {
        if (u)
          switch (u) {
            case "BigInt":
              return i([u, s.toString()], s);
            case "Boolean":
            case "Number":
            case "String":
              return i([u, s.valueOf()], s);
          }
        if (t && "toJSON" in s)
          return a(s.toJSON());
        const c = [], f = i([o, c], s);
        for (const h of cf(s))
          (e || !_t(bt(s[h]))) && c.push([a(h), a(s[h])]);
        return f;
      }
      case cr:
        return i([o, isNaN(s.getTime()) ? qe : s.toISOString()], s);
      case fr: {
        const { source: c, flags: f } = s;
        return i([o, { source: c, flags: f }], s);
      }
      case dr: {
        const c = [], f = i([o, c], s);
        for (const [h, d] of s)
          (e || !(_t(bt(h)) || _t(bt(d)))) && c.push([a(h), a(d)]);
        return f;
      }
      case hr: {
        const c = [], f = i([o, c], s);
        for (const h of s)
          (e || !_t(bt(h))) && c.push(a(h));
        return f;
      }
    }
    const { message: l } = s;
    return i([o, { name: u, message: l }], s);
  };
  return a;
}, wi = (e, { json: t, lossy: n } = {}) => {
  const r = [];
  return ff(!(t || n), !!t, /* @__PURE__ */ new Map(), r)(e), r;
}, Wt = typeof structuredClone == "function" ? (
  /* c8 ignore start */
  (e, t) => t && ("json" in t || "lossy" in t) ? vi(wi(e, t)) : structuredClone(e)
) : (e, t) => vi(wi(e, t));
function df(e, t) {
  const n = [{ type: "text", value: "↩" }];
  return t > 1 && n.push({
    type: "element",
    tagName: "sup",
    properties: {},
    children: [{ type: "text", value: String(t) }]
  }), n;
}
function hf(e, t) {
  return "Back to reference " + (e + 1) + (t > 1 ? "-" + t : "");
}
function pf(e) {
  const t = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", n = e.options.footnoteBackContent || df, r = e.options.footnoteBackLabel || hf, i = e.options.footnoteLabel || "Footnotes", a = e.options.footnoteLabelTagName || "h2", s = e.options.footnoteLabelProperties || {
    className: ["sr-only"]
  }, o = [];
  let u = -1;
  for (; ++u < e.footnoteOrder.length; ) {
    const l = e.footnoteById.get(
      e.footnoteOrder[u]
    );
    if (!l)
      continue;
    const c = e.all(l), f = String(l.identifier).toUpperCase(), h = lt(f.toLowerCase());
    let d = 0;
    const p = [], m = e.footnoteCounts.get(f);
    for (; m !== void 0 && ++d <= m; ) {
      p.length > 0 && p.push({ type: "text", value: " " });
      let S = typeof n == "string" ? n : n(u, d);
      typeof S == "string" && (S = { type: "text", value: S }), p.push({
        type: "element",
        tagName: "a",
        properties: {
          href: "#" + t + "fnref-" + h + (d > 1 ? "-" + d : ""),
          dataFootnoteBackref: "",
          ariaLabel: typeof r == "string" ? r : r(u, d),
          className: ["data-footnote-backref"]
        },
        children: Array.isArray(S) ? S : [S]
      });
    }
    const v = c[c.length - 1];
    if (v && v.type === "element" && v.tagName === "p") {
      const S = v.children[v.children.length - 1];
      S && S.type === "text" ? S.value += " " : v.children.push({ type: "text", value: " " }), v.children.push(...p);
    } else
      c.push(...p);
    const k = {
      type: "element",
      tagName: "li",
      properties: { id: t + "fn-" + h },
      children: e.wrap(c, !0)
    };
    e.patch(l, k), o.push(k);
  }
  if (o.length !== 0)
    return {
      type: "element",
      tagName: "section",
      properties: { dataFootnotes: !0, className: ["footnotes"] },
      children: [
        {
          type: "element",
          tagName: a,
          properties: {
            ...Wt(s),
            id: "footnote-label"
          },
          children: [{ type: "text", value: i }]
        },
        { type: "text", value: `
` },
        {
          type: "element",
          tagName: "ol",
          properties: {},
          children: e.wrap(o, !0)
        },
        { type: "text", value: `
` }
      ]
    };
}
const tn = (
  // Note: overloads in JSDoc can’t yet use different `@template`s.
  /**
   * @type {(
   *   (<Condition extends string>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & {type: Condition}) &
   *   (<Condition extends Props>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Condition) &
   *   (<Condition extends TestFunction>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Predicate<Condition, Node>) &
   *   ((test?: null | undefined) => (node?: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node) &
   *   ((test?: Test) => Check)
   * )}
   */
  /**
   * @param {Test} [test]
   * @returns {Check}
   */
  (function(e) {
    if (e == null)
      return bf;
    if (typeof e == "function")
      return nn(e);
    if (typeof e == "object")
      return Array.isArray(e) ? gf(e) : (
        // Cast because `ReadonlyArray` goes into the above but `isArray`
        // narrows to `Array`.
        mf(
          /** @type {Props} */
          e
        )
      );
    if (typeof e == "string")
      return yf(e);
    throw new Error("Expected function, string, or object as test");
  })
);
function gf(e) {
  const t = [];
  let n = -1;
  for (; ++n < e.length; )
    t[n] = tn(e[n]);
  return nn(r);
  function r(...i) {
    let a = -1;
    for (; ++a < t.length; )
      if (t[a].apply(this, i)) return !0;
    return !1;
  }
}
function mf(e) {
  const t = (
    /** @type {Record<string, unknown>} */
    e
  );
  return nn(n);
  function n(r) {
    const i = (
      /** @type {Record<string, unknown>} */
      /** @type {unknown} */
      r
    );
    let a;
    for (a in e)
      if (i[a] !== t[a]) return !1;
    return !0;
  }
}
function yf(e) {
  return nn(t);
  function t(n) {
    return n && n.type === e;
  }
}
function nn(e) {
  return t;
  function t(n, r, i) {
    return !!(xf(n) && e.call(
      this,
      n,
      typeof r == "number" ? r : void 0,
      i || void 0
    ));
  }
}
function bf() {
  return !0;
}
function xf(e) {
  return e !== null && typeof e == "object" && "type" in e;
}
const Ha = [], kf = !0, Un = !1, vf = "skip";
function Ua(e, t, n, r) {
  let i;
  typeof t == "function" && typeof n != "function" ? (r = n, n = t) : i = t;
  const a = tn(i), s = r ? -1 : 1;
  o(e, void 0, [])();
  function o(u, l, c) {
    const f = (
      /** @type {Record<string, unknown>} */
      u && typeof u == "object" ? u : {}
    );
    if (typeof f.type == "string") {
      const d = (
        // `hast`
        typeof f.tagName == "string" ? f.tagName : (
          // `xast`
          typeof f.name == "string" ? f.name : void 0
        )
      );
      Object.defineProperty(h, "name", {
        value: "node (" + (u.type + (d ? "<" + d + ">" : "")) + ")"
      });
    }
    return h;
    function h() {
      let d = Ha, p, m, v;
      if ((!t || a(u, l, c[c.length - 1] || void 0)) && (d = wf(n(u, c)), d[0] === Un))
        return d;
      if ("children" in u && u.children) {
        const k = (
          /** @type {UnistParent} */
          u
        );
        if (k.children && d[0] !== vf)
          for (m = (r ? k.children.length : -1) + s, v = c.concat(k); m > -1 && m < k.children.length; ) {
            const S = k.children[m];
            if (p = o(S, m, v)(), p[0] === Un)
              return p;
            m = typeof p[1] == "number" ? p[1] : m + s;
          }
      }
      return d;
    }
  }
}
function wf(e) {
  return Array.isArray(e) ? e : typeof e == "number" ? [kf, e] : e == null ? Ha : [e];
}
function pr(e, t, n, r) {
  let i, a, s;
  typeof t == "function" && typeof n != "function" ? (a = void 0, s = t, i = n) : (a = t, s = n, i = r), Ua(e, a, o, i);
  function o(u, l) {
    const c = l[l.length - 1], f = c ? c.children.indexOf(u) : void 0;
    return s(u, f, c);
  }
}
const qn = {}.hasOwnProperty, Sf = {};
function Cf(e, t) {
  const n = t || Sf, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), s = { ...of, ...n.handlers }, o = {
    all: l,
    applyData: Nf,
    definitionById: r,
    footnoteById: i,
    footnoteCounts: a,
    footnoteOrder: [],
    handlers: s,
    one: u,
    options: n,
    patch: Ef,
    wrap: Tf
  };
  return pr(e, function(c) {
    if (c.type === "definition" || c.type === "footnoteDefinition") {
      const f = c.type === "definition" ? r : i, h = String(c.identifier).toUpperCase();
      f.has(h) || f.set(h, c);
    }
  }), o;
  function u(c, f) {
    const h = c.type, d = o.handlers[h];
    if (qn.call(o.handlers, h) && d)
      return d(o, c, f);
    if (o.options.passThrough && o.options.passThrough.includes(h)) {
      if ("children" in c) {
        const { children: m, ...v } = c, k = Wt(v);
        return k.children = o.all(c), k;
      }
      return Wt(c);
    }
    return (o.options.unknownHandler || If)(o, c, f);
  }
  function l(c) {
    const f = [];
    if ("children" in c) {
      const h = c.children;
      let d = -1;
      for (; ++d < h.length; ) {
        const p = o.one(h[d], c);
        if (p) {
          if (d && h[d - 1].type === "break" && (!Array.isArray(p) && p.type === "text" && (p.value = Si(p.value)), !Array.isArray(p) && p.type === "element")) {
            const m = p.children[0];
            m && m.type === "text" && (m.value = Si(m.value));
          }
          Array.isArray(p) ? f.push(...p) : f.push(p);
        }
      }
    }
    return f;
  }
}
function Ef(e, t) {
  e.position && (t.position = dl(e));
}
function Nf(e, t) {
  let n = t;
  if (e && e.data) {
    const r = e.data.hName, i = e.data.hChildren, a = e.data.hProperties;
    if (typeof r == "string")
      if (n.type === "element")
        n.tagName = r;
      else {
        const s = "children" in n ? n.children : [n];
        n = { type: "element", tagName: r, properties: {}, children: s };
      }
    n.type === "element" && a && Object.assign(n.properties, Wt(a)), "children" in n && n.children && i !== null && i !== void 0 && (n.children = i);
  }
  return n;
}
function If(e, t) {
  const n = t.data || {}, r = "value" in t && !(qn.call(n, "hProperties") || qn.call(n, "hChildren")) ? { type: "text", value: t.value } : {
    type: "element",
    tagName: "div",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Tf(e, t) {
  const n = [];
  let r = -1;
  for (t && n.push({ type: "text", value: `
` }); ++r < e.length; )
    r && n.push({ type: "text", value: `
` }), n.push(e[r]);
  return t && e.length > 0 && n.push({ type: "text", value: `
` }), n;
}
function Si(e) {
  let t = 0, n = e.charCodeAt(t);
  for (; n === 9 || n === 32; )
    t++, n = e.charCodeAt(t);
  return e.slice(t);
}
function Ci(e, t) {
  const n = Cf(e, t), r = n.one(e, void 0), i = pf(n), a = Array.isArray(r) ? { type: "root", children: r } : r || { type: "root", children: [] };
  return i && a.children.push({ type: "text", value: `
` }, i), a;
}
function Lf(e, t) {
  return e && "run" in e ? async function(n, r) {
    const i = (
      /** @type {HastRoot} */
      Ci(n, { file: r, ...t })
    );
    await e.run(i, r);
  } : function(n, r) {
    return (
      /** @type {HastRoot} */
      Ci(n, { file: r, ...e || t })
    );
  };
}
function Ei(e) {
  if (e)
    throw e;
}
var bn, Ni;
function Af() {
  if (Ni) return bn;
  Ni = 1;
  var e = Object.prototype.hasOwnProperty, t = Object.prototype.toString, n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, i = function(l) {
    return typeof Array.isArray == "function" ? Array.isArray(l) : t.call(l) === "[object Array]";
  }, a = function(l) {
    if (!l || t.call(l) !== "[object Object]")
      return !1;
    var c = e.call(l, "constructor"), f = l.constructor && l.constructor.prototype && e.call(l.constructor.prototype, "isPrototypeOf");
    if (l.constructor && !c && !f)
      return !1;
    var h;
    for (h in l)
      ;
    return typeof h > "u" || e.call(l, h);
  }, s = function(l, c) {
    n && c.name === "__proto__" ? n(l, c.name, {
      enumerable: !0,
      configurable: !0,
      value: c.newValue,
      writable: !0
    }) : l[c.name] = c.newValue;
  }, o = function(l, c) {
    if (c === "__proto__")
      if (e.call(l, c)) {
        if (r)
          return r(l, c).value;
      } else return;
    return l[c];
  };
  return bn = function u() {
    var l, c, f, h, d, p, m = arguments[0], v = 1, k = arguments.length, S = !1;
    for (typeof m == "boolean" && (S = m, m = arguments[1] || {}, v = 2), (m == null || typeof m != "object" && typeof m != "function") && (m = {}); v < k; ++v)
      if (l = arguments[v], l != null)
        for (c in l)
          f = o(m, c), h = o(l, c), m !== h && (S && h && (a(h) || (d = i(h))) ? (d ? (d = !1, p = f && i(f) ? f : []) : p = f && a(f) ? f : {}, s(m, { name: c, newValue: u(S, p, h) })) : typeof h < "u" && s(m, { name: c, newValue: h }));
    return m;
  }, bn;
}
var Rf = Af();
const xn = /* @__PURE__ */ Ji(Rf);
function Kn(e) {
  if (typeof e != "object" || e === null)
    return !1;
  const t = Object.getPrototypeOf(e);
  return (t === null || t === Object.prototype || Object.getPrototypeOf(t) === null) && !(Symbol.toStringTag in e) && !(Symbol.iterator in e);
}
function Of() {
  const e = [], t = { run: n, use: r };
  return t;
  function n(...i) {
    let a = -1;
    const s = i.pop();
    if (typeof s != "function")
      throw new TypeError("Expected function as last argument, not " + s);
    o(null, ...i);
    function o(u, ...l) {
      const c = e[++a];
      let f = -1;
      if (u) {
        s(u);
        return;
      }
      for (; ++f < i.length; )
        (l[f] === null || l[f] === void 0) && (l[f] = i[f]);
      i = l, c ? Pf(c, o)(...l) : s(null, ...l);
    }
  }
  function r(i) {
    if (typeof i != "function")
      throw new TypeError(
        "Expected `middelware` to be a function, not " + i
      );
    return e.push(i), t;
  }
}
function Pf(e, t) {
  let n;
  return r;
  function r(...s) {
    const o = e.length > s.length;
    let u;
    o && s.push(i);
    try {
      u = e.apply(this, s);
    } catch (l) {
      const c = (
        /** @type {Error} */
        l
      );
      if (o && n)
        throw c;
      return i(c);
    }
    o || (u && u.then && typeof u.then == "function" ? u.then(a, i) : u instanceof Error ? i(u) : a(u));
  }
  function i(s, ...o) {
    n || (n = !0, t(s, ...o));
  }
  function a(s) {
    i(null, s);
  }
}
const Ie = { basename: Df, dirname: _f, extname: Ff, join: Mf, sep: "/" };
function Df(e, t) {
  if (t !== void 0 && typeof t != "string")
    throw new TypeError('"ext" argument must be a string');
  At(e);
  let n = 0, r = -1, i = e.length, a;
  if (t === void 0 || t.length === 0 || t.length > e.length) {
    for (; i--; )
      if (e.codePointAt(i) === 47) {
        if (a) {
          n = i + 1;
          break;
        }
      } else r < 0 && (a = !0, r = i + 1);
    return r < 0 ? "" : e.slice(n, r);
  }
  if (t === e)
    return "";
  let s = -1, o = t.length - 1;
  for (; i--; )
    if (e.codePointAt(i) === 47) {
      if (a) {
        n = i + 1;
        break;
      }
    } else
      s < 0 && (a = !0, s = i + 1), o > -1 && (e.codePointAt(i) === t.codePointAt(o--) ? o < 0 && (r = i) : (o = -1, r = s));
  return n === r ? r = s : r < 0 && (r = e.length), e.slice(n, r);
}
function _f(e) {
  if (At(e), e.length === 0)
    return ".";
  let t = -1, n = e.length, r;
  for (; --n; )
    if (e.codePointAt(n) === 47) {
      if (r) {
        t = n;
        break;
      }
    } else r || (r = !0);
  return t < 0 ? e.codePointAt(0) === 47 ? "/" : "." : t === 1 && e.codePointAt(0) === 47 ? "//" : e.slice(0, t);
}
function Ff(e) {
  At(e);
  let t = e.length, n = -1, r = 0, i = -1, a = 0, s;
  for (; t--; ) {
    const o = e.codePointAt(t);
    if (o === 47) {
      if (s) {
        r = t + 1;
        break;
      }
      continue;
    }
    n < 0 && (s = !0, n = t + 1), o === 46 ? i < 0 ? i = t : a !== 1 && (a = 1) : i > -1 && (a = -1);
  }
  return i < 0 || n < 0 || // We saw a non-dot character immediately before the dot.
  a === 0 || // The (right-most) trimmed path component is exactly `..`.
  a === 1 && i === n - 1 && i === r + 1 ? "" : e.slice(i, n);
}
function Mf(...e) {
  let t = -1, n;
  for (; ++t < e.length; )
    At(e[t]), e[t] && (n = n === void 0 ? e[t] : n + "/" + e[t]);
  return n === void 0 ? "." : zf(n);
}
function zf(e) {
  At(e);
  const t = e.codePointAt(0) === 47;
  let n = jf(e, !t);
  return n.length === 0 && !t && (n = "."), n.length > 0 && e.codePointAt(e.length - 1) === 47 && (n += "/"), t ? "/" + n : n;
}
function jf(e, t) {
  let n = "", r = 0, i = -1, a = 0, s = -1, o, u;
  for (; ++s <= e.length; ) {
    if (s < e.length)
      o = e.codePointAt(s);
    else {
      if (o === 47)
        break;
      o = 47;
    }
    if (o === 47) {
      if (!(i === s - 1 || a === 1)) if (i !== s - 1 && a === 2) {
        if (n.length < 2 || r !== 2 || n.codePointAt(n.length - 1) !== 46 || n.codePointAt(n.length - 2) !== 46) {
          if (n.length > 2) {
            if (u = n.lastIndexOf("/"), u !== n.length - 1) {
              u < 0 ? (n = "", r = 0) : (n = n.slice(0, u), r = n.length - 1 - n.lastIndexOf("/")), i = s, a = 0;
              continue;
            }
          } else if (n.length > 0) {
            n = "", r = 0, i = s, a = 0;
            continue;
          }
        }
        t && (n = n.length > 0 ? n + "/.." : "..", r = 2);
      } else
        n.length > 0 ? n += "/" + e.slice(i + 1, s) : n = e.slice(i + 1, s), r = s - i - 1;
      i = s, a = 0;
    } else o === 46 && a > -1 ? a++ : a = -1;
  }
  return n;
}
function At(e) {
  if (typeof e != "string")
    throw new TypeError(
      "Path must be a string. Received " + JSON.stringify(e)
    );
}
const $f = { cwd: Bf };
function Bf() {
  return "/";
}
function Wn(e) {
  return !!(e !== null && typeof e == "object" && "href" in e && e.href && "protocol" in e && e.protocol && // @ts-expect-error: indexing is fine.
  e.auth === void 0);
}
function Vf(e) {
  if (typeof e == "string")
    e = new URL(e);
  else if (!Wn(e)) {
    const t = new TypeError(
      'The "path" argument must be of type string or an instance of URL. Received `' + e + "`"
    );
    throw t.code = "ERR_INVALID_ARG_TYPE", t;
  }
  if (e.protocol !== "file:") {
    const t = new TypeError("The URL must be of scheme file");
    throw t.code = "ERR_INVALID_URL_SCHEME", t;
  }
  return Hf(e);
}
function Hf(e) {
  if (e.hostname !== "") {
    const r = new TypeError(
      'File URL host must be "localhost" or empty on darwin'
    );
    throw r.code = "ERR_INVALID_FILE_URL_HOST", r;
  }
  const t = e.pathname;
  let n = -1;
  for (; ++n < t.length; )
    if (t.codePointAt(n) === 37 && t.codePointAt(n + 1) === 50) {
      const r = t.codePointAt(n + 2);
      if (r === 70 || r === 102) {
        const i = new TypeError(
          "File URL path must not include encoded / characters"
        );
        throw i.code = "ERR_INVALID_FILE_URL_PATH", i;
      }
    }
  return decodeURIComponent(t);
}
const kn = (
  /** @type {const} */
  [
    "history",
    "path",
    "basename",
    "stem",
    "extname",
    "dirname"
  ]
);
class qa {
  /**
   * Create a new virtual file.
   *
   * `options` is treated as:
   *
   * *   `string` or `Uint8Array` — `{value: options}`
   * *   `URL` — `{path: options}`
   * *   `VFile` — shallow copies its data over to the new file
   * *   `object` — all fields are shallow copied over to the new file
   *
   * Path related fields are set in the following order (least specific to
   * most specific): `history`, `path`, `basename`, `stem`, `extname`,
   * `dirname`.
   *
   * You cannot set `dirname` or `extname` without setting either `history`,
   * `path`, `basename`, or `stem` too.
   *
   * @param {Compatible | null | undefined} [value]
   *   File value.
   * @returns
   *   New instance.
   */
  constructor(t) {
    let n;
    t ? Wn(t) ? n = { path: t } : typeof t == "string" || Uf(t) ? n = { value: t } : n = t : n = {}, this.cwd = "cwd" in n ? "" : $f.cwd(), this.data = {}, this.history = [], this.messages = [], this.value, this.map, this.result, this.stored;
    let r = -1;
    for (; ++r < kn.length; ) {
      const a = kn[r];
      a in n && n[a] !== void 0 && n[a] !== null && (this[a] = a === "history" ? [...n[a]] : n[a]);
    }
    let i;
    for (i in n)
      kn.includes(i) || (this[i] = n[i]);
  }
  /**
   * Get the basename (including extname) (example: `'index.min.js'`).
   *
   * @returns {string | undefined}
   *   Basename.
   */
  get basename() {
    return typeof this.path == "string" ? Ie.basename(this.path) : void 0;
  }
  /**
   * Set basename (including extname) (`'index.min.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   *
   * @param {string} basename
   *   Basename.
   * @returns {undefined}
   *   Nothing.
   */
  set basename(t) {
    wn(t, "basename"), vn(t, "basename"), this.path = Ie.join(this.dirname || "", t);
  }
  /**
   * Get the parent path (example: `'~'`).
   *
   * @returns {string | undefined}
   *   Dirname.
   */
  get dirname() {
    return typeof this.path == "string" ? Ie.dirname(this.path) : void 0;
  }
  /**
   * Set the parent path (example: `'~'`).
   *
   * Cannot be set if there’s no `path` yet.
   *
   * @param {string | undefined} dirname
   *   Dirname.
   * @returns {undefined}
   *   Nothing.
   */
  set dirname(t) {
    Ii(this.basename, "dirname"), this.path = Ie.join(t || "", this.basename);
  }
  /**
   * Get the extname (including dot) (example: `'.js'`).
   *
   * @returns {string | undefined}
   *   Extname.
   */
  get extname() {
    return typeof this.path == "string" ? Ie.extname(this.path) : void 0;
  }
  /**
   * Set the extname (including dot) (example: `'.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be set if there’s no `path` yet.
   *
   * @param {string | undefined} extname
   *   Extname.
   * @returns {undefined}
   *   Nothing.
   */
  set extname(t) {
    if (vn(t, "extname"), Ii(this.dirname, "extname"), t) {
      if (t.codePointAt(0) !== 46)
        throw new Error("`extname` must start with `.`");
      if (t.includes(".", 1))
        throw new Error("`extname` cannot contain multiple dots");
    }
    this.path = Ie.join(this.dirname, this.stem + (t || ""));
  }
  /**
   * Get the full path (example: `'~/index.min.js'`).
   *
   * @returns {string}
   *   Path.
   */
  get path() {
    return this.history[this.history.length - 1];
  }
  /**
   * Set the full path (example: `'~/index.min.js'`).
   *
   * Cannot be nullified.
   * You can set a file URL (a `URL` object with a `file:` protocol) which will
   * be turned into a path with `url.fileURLToPath`.
   *
   * @param {URL | string} path
   *   Path.
   * @returns {undefined}
   *   Nothing.
   */
  set path(t) {
    Wn(t) && (t = Vf(t)), wn(t, "path"), this.path !== t && this.history.push(t);
  }
  /**
   * Get the stem (basename w/o extname) (example: `'index.min'`).
   *
   * @returns {string | undefined}
   *   Stem.
   */
  get stem() {
    return typeof this.path == "string" ? Ie.basename(this.path, this.extname) : void 0;
  }
  /**
   * Set the stem (basename w/o extname) (example: `'index.min'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   *
   * @param {string} stem
   *   Stem.
   * @returns {undefined}
   *   Nothing.
   */
  set stem(t) {
    wn(t, "stem"), vn(t, "stem"), this.path = Ie.join(this.dirname || "", t + (this.extname || ""));
  }
  // Normal prototypal methods.
  /**
   * Create a fatal message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `true` (error; file not usable)
   * and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {never}
   *   Never.
   * @throws {VFileMessage}
   *   Message.
   */
  fail(t, n, r) {
    const i = this.message(t, n, r);
    throw i.fatal = !0, i;
  }
  /**
   * Create an info message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `undefined` (info; change
   * likely not needed) and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  info(t, n, r) {
    const i = this.message(t, n, r);
    return i.fatal = void 0, i;
  }
  /**
   * Create a message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `false` (warning; change may be
   * needed) and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  message(t, n, r) {
    const i = new fe(
      // @ts-expect-error: the overloads are fine.
      t,
      n,
      r
    );
    return this.path && (i.name = this.path + ":" + i.name, i.file = this.path), i.fatal = !1, this.messages.push(i), i;
  }
  /**
   * Serialize the file.
   *
   * > **Note**: which encodings are supported depends on the engine.
   * > For info on Node.js, see:
   * > <https://nodejs.org/api/util.html#whatwg-supported-encodings>.
   *
   * @param {string | null | undefined} [encoding='utf8']
   *   Character encoding to understand `value` as when it’s a `Uint8Array`
   *   (default: `'utf-8'`).
   * @returns {string}
   *   Serialized file.
   */
  toString(t) {
    return this.value === void 0 ? "" : typeof this.value == "string" ? this.value : new TextDecoder(t || void 0).decode(this.value);
  }
}
function vn(e, t) {
  if (e && e.includes(Ie.sep))
    throw new Error(
      "`" + t + "` cannot be a path: did not expect `" + Ie.sep + "`"
    );
}
function wn(e, t) {
  if (!e)
    throw new Error("`" + t + "` cannot be empty");
}
function Ii(e, t) {
  if (!e)
    throw new Error("Setting `" + t + "` requires `path` to be set too");
}
function Uf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const qf = (
  /**
   * @type {new <Parameters extends Array<unknown>, Result>(property: string | symbol) => (...parameters: Parameters) => Result}
   */
  /** @type {unknown} */
  /**
   * @this {Function}
   * @param {string | symbol} property
   * @returns {(...parameters: Array<unknown>) => unknown}
   */
  (function(e) {
    const r = (
      /** @type {Record<string | symbol, Function>} */
      // Prototypes do exist.
      // type-coverage:ignore-next-line
      this.constructor.prototype
    ), i = r[e], a = function() {
      return i.apply(a, arguments);
    };
    return Object.setPrototypeOf(a, r), a;
  })
), Kf = {}.hasOwnProperty;
class gr extends qf {
  /**
   * Create a processor.
   */
  constructor() {
    super("copy"), this.Compiler = void 0, this.Parser = void 0, this.attachers = [], this.compiler = void 0, this.freezeIndex = -1, this.frozen = void 0, this.namespace = {}, this.parser = void 0, this.transformers = Of();
  }
  /**
   * Copy a processor.
   *
   * @deprecated
   *   This is a private internal method and should not be used.
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   New *unfrozen* processor ({@linkcode Processor}) that is
   *   configured to work the same as its ancestor.
   *   When the descendant processor is configured in the future it does not
   *   affect the ancestral processor.
   */
  copy() {
    const t = (
      /** @type {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>} */
      new gr()
    );
    let n = -1;
    for (; ++n < this.attachers.length; ) {
      const r = this.attachers[n];
      t.use(...r);
    }
    return t.data(xn(!0, {}, this.namespace)), t;
  }
  /**
   * Configure the processor with info available to all plugins.
   * Information is stored in an object.
   *
   * Typically, options can be given to a specific plugin, but sometimes it
   * makes sense to have information shared with several plugins.
   * For example, a list of HTML elements that are self-closing, which is
   * needed during all phases.
   *
   * > **Note**: setting information cannot occur on *frozen* processors.
   * > Call the processor first to create a new unfrozen processor.
   *
   * > **Note**: to register custom data in TypeScript, augment the
   * > {@linkcode Data} interface.
   *
   * @example
   *   This example show how to get and set info:
   *
   *   ```js
   *   import {unified} from 'unified'
   *
   *   const processor = unified().data('alpha', 'bravo')
   *
   *   processor.data('alpha') // => 'bravo'
   *
   *   processor.data() // => {alpha: 'bravo'}
   *
   *   processor.data({charlie: 'delta'})
   *
   *   processor.data() // => {charlie: 'delta'}
   *   ```
   *
   * @template {keyof Data} Key
   *
   * @overload
   * @returns {Data}
   *
   * @overload
   * @param {Data} dataset
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {Key} key
   * @returns {Data[Key]}
   *
   * @overload
   * @param {Key} key
   * @param {Data[Key]} value
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @param {Data | Key} [key]
   *   Key to get or set, or entire dataset to set, or nothing to get the
   *   entire dataset (optional).
   * @param {Data[Key]} [value]
   *   Value to set (optional).
   * @returns {unknown}
   *   The current processor when setting, the value at `key` when getting, or
   *   the entire dataset when getting without key.
   */
  data(t, n) {
    return typeof t == "string" ? arguments.length === 2 ? (En("data", this.frozen), this.namespace[t] = n, this) : Kf.call(this.namespace, t) && this.namespace[t] || void 0 : t ? (En("data", this.frozen), this.namespace = t, this) : this.namespace;
  }
  /**
   * Freeze a processor.
   *
   * Frozen processors are meant to be extended and not to be configured
   * directly.
   *
   * When a processor is frozen it cannot be unfrozen.
   * New processors working the same way can be created by calling the
   * processor.
   *
   * It’s possible to freeze processors explicitly by calling `.freeze()`.
   * Processors freeze automatically when `.parse()`, `.run()`, `.runSync()`,
   * `.stringify()`, `.process()`, or `.processSync()` are called.
   *
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   The current processor.
   */
  freeze() {
    if (this.frozen)
      return this;
    const t = (
      /** @type {Processor} */
      /** @type {unknown} */
      this
    );
    for (; ++this.freezeIndex < this.attachers.length; ) {
      const [n, ...r] = this.attachers[this.freezeIndex];
      if (r[0] === !1)
        continue;
      r[0] === !0 && (r[0] = void 0);
      const i = n.call(t, ...r);
      typeof i == "function" && this.transformers.use(i);
    }
    return this.frozen = !0, this.freezeIndex = Number.POSITIVE_INFINITY, this;
  }
  /**
   * Parse text to a syntax tree.
   *
   * > **Note**: `parse` freezes the processor if not already *frozen*.
   *
   * > **Note**: `parse` performs the parse phase, not the run phase or other
   * > phases.
   *
   * @param {Compatible | undefined} [file]
   *   file to parse (optional); typically `string` or `VFile`; any value
   *   accepted as `x` in `new VFile(x)`.
   * @returns {ParseTree extends undefined ? Node : ParseTree}
   *   Syntax tree representing `file`.
   */
  parse(t) {
    this.freeze();
    const n = Ft(t), r = this.parser || this.Parser;
    return Sn("parse", r), r(String(n), n);
  }
  /**
   * Process the given file as configured on the processor.
   *
   * > **Note**: `process` freezes the processor if not already *frozen*.
   *
   * > **Note**: `process` performs the parse, run, and stringify phases.
   *
   * @overload
   * @param {Compatible | undefined} file
   * @param {ProcessCallback<VFileWithOutput<CompileResult>>} done
   * @returns {undefined}
   *
   * @overload
   * @param {Compatible | undefined} [file]
   * @returns {Promise<VFileWithOutput<CompileResult>>}
   *
   * @param {Compatible | undefined} [file]
   *   File (optional); typically `string` or `VFile`]; any value accepted as
   *   `x` in `new VFile(x)`.
   * @param {ProcessCallback<VFileWithOutput<CompileResult>> | undefined} [done]
   *   Callback (optional).
   * @returns {Promise<VFile> | undefined}
   *   Nothing if `done` is given.
   *   Otherwise a promise, rejected with a fatal error or resolved with the
   *   processed file.
   *
   *   The parsed, transformed, and compiled value is available at
   *   `file.value` (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most
   *   > compilers return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  process(t, n) {
    const r = this;
    return this.freeze(), Sn("process", this.parser || this.Parser), Cn("process", this.compiler || this.Compiler), n ? i(void 0, n) : new Promise(i);
    function i(a, s) {
      const o = Ft(t), u = (
        /** @type {HeadTree extends undefined ? Node : HeadTree} */
        /** @type {unknown} */
        r.parse(o)
      );
      r.run(u, o, function(c, f, h) {
        if (c || !f || !h)
          return l(c);
        const d = (
          /** @type {CompileTree extends undefined ? Node : CompileTree} */
          /** @type {unknown} */
          f
        ), p = r.stringify(d, h);
        Jf(p) ? h.value = p : h.result = p, l(
          c,
          /** @type {VFileWithOutput<CompileResult>} */
          h
        );
      });
      function l(c, f) {
        c || !f ? s(c) : a ? a(f) : n(void 0, f);
      }
    }
  }
  /**
   * Process the given file as configured on the processor.
   *
   * An error is thrown if asynchronous transforms are configured.
   *
   * > **Note**: `processSync` freezes the processor if not already *frozen*.
   *
   * > **Note**: `processSync` performs the parse, run, and stringify phases.
   *
   * @param {Compatible | undefined} [file]
   *   File (optional); typically `string` or `VFile`; any value accepted as
   *   `x` in `new VFile(x)`.
   * @returns {VFileWithOutput<CompileResult>}
   *   The processed file.
   *
   *   The parsed, transformed, and compiled value is available at
   *   `file.value` (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most
   *   > compilers return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  processSync(t) {
    let n = !1, r;
    return this.freeze(), Sn("processSync", this.parser || this.Parser), Cn("processSync", this.compiler || this.Compiler), this.process(t, i), Li("processSync", "process", n), r;
    function i(a, s) {
      n = !0, Ei(a), r = s;
    }
  }
  /**
   * Run *transformers* on a syntax tree.
   *
   * > **Note**: `run` freezes the processor if not already *frozen*.
   *
   * > **Note**: `run` performs the run phase, not other phases.
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} done
   * @returns {undefined}
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {Compatible | undefined} file
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} done
   * @returns {undefined}
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {Compatible | undefined} [file]
   * @returns {Promise<TailTree extends undefined ? Node : TailTree>}
   *
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   *   Tree to transform and inspect.
   * @param {(
   *   RunCallback<TailTree extends undefined ? Node : TailTree> |
   *   Compatible
   * )} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} [done]
   *   Callback (optional).
   * @returns {Promise<TailTree extends undefined ? Node : TailTree> | undefined}
   *   Nothing if `done` is given.
   *   Otherwise, a promise rejected with a fatal error or resolved with the
   *   transformed tree.
   */
  run(t, n, r) {
    Ti(t), this.freeze();
    const i = this.transformers;
    return !r && typeof n == "function" && (r = n, n = void 0), r ? a(void 0, r) : new Promise(a);
    function a(s, o) {
      const u = Ft(n);
      i.run(t, u, l);
      function l(c, f, h) {
        const d = (
          /** @type {TailTree extends undefined ? Node : TailTree} */
          f || t
        );
        c ? o(c) : s ? s(d) : r(void 0, d, h);
      }
    }
  }
  /**
   * Run *transformers* on a syntax tree.
   *
   * An error is thrown if asynchronous transforms are configured.
   *
   * > **Note**: `runSync` freezes the processor if not already *frozen*.
   *
   * > **Note**: `runSync` performs the run phase, not other phases.
   *
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   *   Tree to transform and inspect.
   * @param {Compatible | undefined} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @returns {TailTree extends undefined ? Node : TailTree}
   *   Transformed tree.
   */
  runSync(t, n) {
    let r = !1, i;
    return this.run(t, n, a), Li("runSync", "run", r), i;
    function a(s, o) {
      Ei(s), i = o, r = !0;
    }
  }
  /**
   * Compile a syntax tree.
   *
   * > **Note**: `stringify` freezes the processor if not already *frozen*.
   *
   * > **Note**: `stringify` performs the stringify phase, not the run phase
   * > or other phases.
   *
   * @param {CompileTree extends undefined ? Node : CompileTree} tree
   *   Tree to compile.
   * @param {Compatible | undefined} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @returns {CompileResult extends undefined ? Value : CompileResult}
   *   Textual representation of the tree (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most compilers
   *   > return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  stringify(t, n) {
    this.freeze();
    const r = Ft(n), i = this.compiler || this.Compiler;
    return Cn("stringify", i), Ti(t), i(t, r);
  }
  /**
   * Configure the processor to use a plugin, a list of usable values, or a
   * preset.
   *
   * If the processor is already using a plugin, the previous plugin
   * configuration is changed based on the options that are passed in.
   * In other words, the plugin is not added a second time.
   *
   * > **Note**: `use` cannot be called on *frozen* processors.
   * > Call the processor first to create a new unfrozen processor.
   *
   * @example
   *   There are many ways to pass plugins to `.use()`.
   *   This example gives an overview:
   *
   *   ```js
   *   import {unified} from 'unified'
   *
   *   unified()
   *     // Plugin with options:
   *     .use(pluginA, {x: true, y: true})
   *     // Passing the same plugin again merges configuration (to `{x: true, y: false, z: true}`):
   *     .use(pluginA, {y: false, z: true})
   *     // Plugins:
   *     .use([pluginB, pluginC])
   *     // Two plugins, the second with options:
   *     .use([pluginD, [pluginE, {}]])
   *     // Preset with plugins and settings:
   *     .use({plugins: [pluginF, [pluginG, {}]], settings: {position: false}})
   *     // Settings only:
   *     .use({settings: {position: false}})
   *   ```
   *
   * @template {Array<unknown>} [Parameters=[]]
   * @template {Node | string | undefined} [Input=undefined]
   * @template [Output=Input]
   *
   * @overload
   * @param {Preset | null | undefined} [preset]
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {PluggableList} list
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {Plugin<Parameters, Input, Output>} plugin
   * @param {...(Parameters | [boolean])} parameters
   * @returns {UsePlugin<ParseTree, HeadTree, TailTree, CompileTree, CompileResult, Input, Output>}
   *
   * @param {PluggableList | Plugin | Preset | null | undefined} value
   *   Usable value.
   * @param {...unknown} parameters
   *   Parameters, when a plugin is given as a usable value.
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   Current processor.
   */
  use(t, ...n) {
    const r = this.attachers, i = this.namespace;
    if (En("use", this.frozen), t != null) if (typeof t == "function")
      u(t, n);
    else if (typeof t == "object")
      Array.isArray(t) ? o(t) : s(t);
    else
      throw new TypeError("Expected usable value, not `" + t + "`");
    return this;
    function a(l) {
      if (typeof l == "function")
        u(l, []);
      else if (typeof l == "object")
        if (Array.isArray(l)) {
          const [c, ...f] = (
            /** @type {PluginTuple<Array<unknown>>} */
            l
          );
          u(c, f);
        } else
          s(l);
      else
        throw new TypeError("Expected usable value, not `" + l + "`");
    }
    function s(l) {
      if (!("plugins" in l) && !("settings" in l))
        throw new Error(
          "Expected usable value but received an empty preset, which is probably a mistake: presets typically come with `plugins` and sometimes with `settings`, but this has neither"
        );
      o(l.plugins), l.settings && (i.settings = xn(!0, i.settings, l.settings));
    }
    function o(l) {
      let c = -1;
      if (l != null) if (Array.isArray(l))
        for (; ++c < l.length; ) {
          const f = l[c];
          a(f);
        }
      else
        throw new TypeError("Expected a list of plugins, not `" + l + "`");
    }
    function u(l, c) {
      let f = -1, h = -1;
      for (; ++f < r.length; )
        if (r[f][0] === l) {
          h = f;
          break;
        }
      if (h === -1)
        r.push([l, ...c]);
      else if (c.length > 0) {
        let [d, ...p] = c;
        const m = r[h][1];
        Kn(m) && Kn(d) && (d = xn(!0, m, d)), r[h] = [l, d, ...p];
      }
    }
  }
}
const Wf = new gr().freeze();
function Sn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `parser`");
}
function Cn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `compiler`");
}
function En(e, t) {
  if (t)
    throw new Error(
      "Cannot call `" + e + "` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`."
    );
}
function Ti(e) {
  if (!Kn(e) || typeof e.type != "string")
    throw new TypeError("Expected node, got `" + e + "`");
}
function Li(e, t, n) {
  if (!n)
    throw new Error(
      "`" + e + "` finished async. Use `" + t + "` instead"
    );
}
function Ft(e) {
  return Gf(e) ? e : new qa(e);
}
function Gf(e) {
  return !!(e && typeof e == "object" && "message" in e && "messages" in e);
}
function Jf(e) {
  return typeof e == "string" || Yf(e);
}
function Yf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const Qf = "https://github.com/remarkjs/react-markdown/blob/main/changelog.md", Ai = [], Ri = { allowDangerousHtml: !0 }, Xf = /^(https?|ircs?|mailto|xmpp)$/i, Zf = [
  { from: "astPlugins", id: "remove-buggy-html-in-markdown-parser" },
  { from: "allowDangerousHtml", id: "remove-buggy-html-in-markdown-parser" },
  {
    from: "allowNode",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "allowElement"
  },
  {
    from: "allowedTypes",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "allowedElements"
  },
  { from: "className", id: "remove-classname" },
  {
    from: "disallowedTypes",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "disallowedElements"
  },
  { from: "escapeHtml", id: "remove-buggy-html-in-markdown-parser" },
  { from: "includeElementIndex", id: "#remove-includeelementindex" },
  {
    from: "includeNodeIndex",
    id: "change-includenodeindex-to-includeelementindex"
  },
  { from: "linkTarget", id: "remove-linktarget" },
  { from: "plugins", id: "change-plugins-to-remarkplugins", to: "remarkPlugins" },
  { from: "rawSourcePos", id: "#remove-rawsourcepos" },
  { from: "renderers", id: "change-renderers-to-components", to: "components" },
  { from: "source", id: "change-source-to-children", to: "children" },
  { from: "sourcePos", id: "#remove-sourcepos" },
  { from: "transformImageUri", id: "#add-urltransform", to: "urlTransform" },
  { from: "transformLinkUri", id: "#add-urltransform", to: "urlTransform" }
];
function ed(e) {
  const t = td(e), n = nd(e);
  return rd(t.runSync(t.parse(n), n), e);
}
function td(e) {
  const t = e.rehypePlugins || Ai, n = e.remarkPlugins || Ai, r = e.remarkRehypeOptions ? { ...e.remarkRehypeOptions, ...Ri } : Ri;
  return Wf().use(Dc).use(n).use(Lf, r).use(t);
}
function nd(e) {
  const t = e.children || "", n = new qa();
  return typeof t == "string" && (n.value = t), n;
}
function rd(e, t) {
  const n = t.allowedElements, r = t.allowElement, i = t.components, a = t.disallowedElements, s = t.skipHtml, o = t.unwrapDisallowed, u = t.urlTransform || id;
  for (const c of Zf)
    Object.hasOwn(t, c.from) && ("" + c.from + (c.to ? "use `" + c.to + "` instead" : "remove it") + Qf + c.id, void 0);
  return pr(e, l), yl(e, {
    Fragment: Jt,
    components: i,
    ignoreInvalidStyle: !0,
    jsx: g,
    jsxs: T,
    passKeys: !0,
    passNode: !0
  });
  function l(c, f, h) {
    if (c.type === "raw" && h && typeof f == "number")
      return s ? h.children.splice(f, 1) : h.children[f] = { type: "text", value: c.value }, f;
    if (c.type === "element") {
      let d;
      for (d in gn)
        if (Object.hasOwn(gn, d) && Object.hasOwn(c.properties, d)) {
          const p = c.properties[d], m = gn[d];
          (m === null || m.includes(c.tagName)) && (c.properties[d] = u(String(p || ""), d, c));
        }
    }
    if (c.type === "element") {
      let d = n ? !n.includes(c.tagName) : a ? a.includes(c.tagName) : !1;
      if (!d && r && typeof f == "number" && (d = !r(c, f, h)), d && h && typeof f == "number")
        return o && c.children ? h.children.splice(f, 1, ...c.children) : h.children.splice(f, 1), f;
    }
  }
}
function id(e) {
  const t = e.indexOf(":"), n = e.indexOf("?"), r = e.indexOf("#"), i = e.indexOf("/");
  return (
    // If there is no protocol, it’s relative.
    t === -1 || // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    i !== -1 && t > i || n !== -1 && t > n || r !== -1 && t > r || // It is a protocol, it should be allowed.
    Xf.test(e.slice(0, t)) ? e : ""
  );
}
function Oi(e, t) {
  const n = String(e);
  if (typeof t != "string")
    throw new TypeError("Expected character");
  let r = 0, i = n.indexOf(t);
  for (; i !== -1; )
    r++, i = n.indexOf(t, i + t.length);
  return r;
}
function ad(e) {
  if (typeof e != "string")
    throw new TypeError("Expected a string");
  return e.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
function sd(e, t, n) {
  const i = tn((n || {}).ignore || []), a = od(t);
  let s = -1;
  for (; ++s < a.length; )
    Ua(e, "text", o);
  function o(l, c) {
    let f = -1, h;
    for (; ++f < c.length; ) {
      const d = c[f], p = h ? h.children : void 0;
      if (i(
        d,
        p ? p.indexOf(d) : void 0,
        h
      ))
        return;
      h = d;
    }
    if (h)
      return u(l, c);
  }
  function u(l, c) {
    const f = c[c.length - 1], h = a[s][0], d = a[s][1];
    let p = 0;
    const v = f.children.indexOf(l);
    let k = !1, S = [];
    h.lastIndex = 0;
    let C = h.exec(l.value);
    for (; C; ) {
      const N = C.index, A = {
        index: C.index,
        input: C.input,
        stack: [...c, l]
      };
      let b = d(...C, A);
      if (typeof b == "string" && (b = b.length > 0 ? { type: "text", value: b } : void 0), b === !1 ? h.lastIndex = N + 1 : (p !== N && S.push({
        type: "text",
        value: l.value.slice(p, N)
      }), Array.isArray(b) ? S.push(...b) : b && S.push(b), p = N + C[0].length, k = !0), !h.global)
        break;
      C = h.exec(l.value);
    }
    return k ? (p < l.value.length && S.push({ type: "text", value: l.value.slice(p) }), f.children.splice(v, 1, ...S)) : S = [l], v + S.length;
  }
}
function od(e) {
  const t = [];
  if (!Array.isArray(e))
    throw new TypeError("Expected find and replace tuple or list of tuples");
  const n = !e[0] || Array.isArray(e[0]) ? e : [e];
  let r = -1;
  for (; ++r < n.length; ) {
    const i = n[r];
    t.push([ld(i[0]), ud(i[1])]);
  }
  return t;
}
function ld(e) {
  return typeof e == "string" ? new RegExp(ad(e), "g") : e;
}
function ud(e) {
  return typeof e == "function" ? e : function() {
    return e;
  };
}
const Nn = "phrasing", In = ["autolink", "link", "image", "label"];
function cd() {
  return {
    transforms: [yd],
    enter: {
      literalAutolink: dd,
      literalAutolinkEmail: Tn,
      literalAutolinkHttp: Tn,
      literalAutolinkWww: Tn
    },
    exit: {
      literalAutolink: md,
      literalAutolinkEmail: gd,
      literalAutolinkHttp: hd,
      literalAutolinkWww: pd
    }
  };
}
function fd() {
  return {
    unsafe: [
      {
        character: "@",
        before: "[+\\-.\\w]",
        after: "[\\-.\\w]",
        inConstruct: Nn,
        notInConstruct: In
      },
      {
        character: ".",
        before: "[Ww]",
        after: "[\\-.\\w]",
        inConstruct: Nn,
        notInConstruct: In
      },
      {
        character: ":",
        before: "[ps]",
        after: "\\/",
        inConstruct: Nn,
        notInConstruct: In
      }
    ]
  };
}
function dd(e) {
  this.enter({ type: "link", title: null, url: "", children: [] }, e);
}
function Tn(e) {
  this.config.enter.autolinkProtocol.call(this, e);
}
function hd(e) {
  this.config.exit.autolinkProtocol.call(this, e);
}
function pd(e) {
  this.config.exit.data.call(this, e);
  const t = this.stack[this.stack.length - 1];
  t.type, t.url = "http://" + this.sliceSerialize(e);
}
function gd(e) {
  this.config.exit.autolinkEmail.call(this, e);
}
function md(e) {
  this.exit(e);
}
function yd(e) {
  sd(
    e,
    [
      [/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi, bd],
      [/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu, xd]
    ],
    { ignore: ["link", "linkReference"] }
  );
}
function bd(e, t, n, r, i) {
  let a = "";
  if (!Ka(i) || (/^w/i.test(t) && (n = t + n, t = "", a = "http://"), !kd(n)))
    return !1;
  const s = vd(n + r);
  if (!s[0]) return !1;
  const o = {
    type: "link",
    title: null,
    url: a + t + s[0],
    children: [{ type: "text", value: t + s[0] }]
  };
  return s[1] ? [o, { type: "text", value: s[1] }] : o;
}
function xd(e, t, n, r) {
  return (
    // Not an expected previous character.
    !Ka(r, !0) || // Label ends in not allowed character.
    /[-\d_]$/.test(n) ? !1 : {
      type: "link",
      title: null,
      url: "mailto:" + t + "@" + n,
      children: [{ type: "text", value: t + "@" + n }]
    }
  );
}
function kd(e) {
  const t = e.split(".");
  return !(t.length < 2 || t[t.length - 1] && (/_/.test(t[t.length - 1]) || !/[a-zA-Z\d]/.test(t[t.length - 1])) || t[t.length - 2] && (/_/.test(t[t.length - 2]) || !/[a-zA-Z\d]/.test(t[t.length - 2])));
}
function vd(e) {
  const t = /[!"&'),.:;<>?\]}]+$/.exec(e);
  if (!t)
    return [e, void 0];
  e = e.slice(0, t.index);
  let n = t[0], r = n.indexOf(")");
  const i = Oi(e, "(");
  let a = Oi(e, ")");
  for (; r !== -1 && i > a; )
    e += n.slice(0, r + 1), n = n.slice(r + 1), r = n.indexOf(")"), a++;
  return [e, n];
}
function Ka(e, t) {
  const n = e.input.charCodeAt(e.index - 1);
  return (e.index === 0 || Je(n) || Xt(n)) && // If it’s an email, the previous character should not be a slash.
  (!t || n !== 47);
}
Wa.peek = Ad;
function wd() {
  this.buffer();
}
function Sd(e) {
  this.enter({ type: "footnoteReference", identifier: "", label: "" }, e);
}
function Cd() {
  this.buffer();
}
function Ed(e) {
  this.enter(
    { type: "footnoteDefinition", identifier: "", label: "", children: [] },
    e
  );
}
function Nd(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ne(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function Id(e) {
  this.exit(e);
}
function Td(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ne(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function Ld(e) {
  this.exit(e);
}
function Ad() {
  return "[";
}
function Wa(e, t, n, r) {
  const i = n.createTracker(r);
  let a = i.move("[^");
  const s = n.enter("footnoteReference"), o = n.enter("reference");
  return a += i.move(
    n.safe(n.associationId(e), { after: "]", before: a })
  ), o(), s(), a += i.move("]"), a;
}
function Rd() {
  return {
    enter: {
      gfmFootnoteCallString: wd,
      gfmFootnoteCall: Sd,
      gfmFootnoteDefinitionLabelString: Cd,
      gfmFootnoteDefinition: Ed
    },
    exit: {
      gfmFootnoteCallString: Nd,
      gfmFootnoteCall: Id,
      gfmFootnoteDefinitionLabelString: Td,
      gfmFootnoteDefinition: Ld
    }
  };
}
function Od(e) {
  let t = !1;
  return e && e.firstLineBlank && (t = !0), {
    handlers: { footnoteDefinition: n, footnoteReference: Wa },
    // This is on by default already.
    unsafe: [{ character: "[", inConstruct: ["label", "phrasing", "reference"] }]
  };
  function n(r, i, a, s) {
    const o = a.createTracker(s);
    let u = o.move("[^");
    const l = a.enter("footnoteDefinition"), c = a.enter("label");
    return u += o.move(
      a.safe(a.associationId(r), { before: u, after: "]" })
    ), c(), u += o.move("]:"), r.children && r.children.length > 0 && (o.shift(4), u += o.move(
      (t ? `
` : " ") + a.indentLines(
        a.containerFlow(r, o.current()),
        t ? Ga : Pd
      )
    )), l(), u;
  }
}
function Pd(e, t, n) {
  return t === 0 ? e : Ga(e, t, n);
}
function Ga(e, t, n) {
  return (n ? "" : "    ") + e;
}
const Dd = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe"
];
Ja.peek = jd;
function _d() {
  return {
    canContainEols: ["delete"],
    enter: { strikethrough: Md },
    exit: { strikethrough: zd }
  };
}
function Fd() {
  return {
    unsafe: [
      {
        character: "~",
        inConstruct: "phrasing",
        notInConstruct: Dd
      }
    ],
    handlers: { delete: Ja }
  };
}
function Md(e) {
  this.enter({ type: "delete", children: [] }, e);
}
function zd(e) {
  this.exit(e);
}
function Ja(e, t, n, r) {
  const i = n.createTracker(r), a = n.enter("strikethrough");
  let s = i.move("~~");
  return s += n.containerPhrasing(e, {
    ...i.current(),
    before: s,
    after: "~"
  }), s += i.move("~~"), a(), s;
}
function jd() {
  return "~";
}
function $d(e) {
  return e.length;
}
function Bd(e, t) {
  const n = t || {}, r = (n.align || []).concat(), i = n.stringLength || $d, a = [], s = [], o = [], u = [];
  let l = 0, c = -1;
  for (; ++c < e.length; ) {
    const m = [], v = [];
    let k = -1;
    for (e[c].length > l && (l = e[c].length); ++k < e[c].length; ) {
      const S = Vd(e[c][k]);
      if (n.alignDelimiters !== !1) {
        const C = i(S);
        v[k] = C, (u[k] === void 0 || C > u[k]) && (u[k] = C);
      }
      m.push(S);
    }
    s[c] = m, o[c] = v;
  }
  let f = -1;
  if (typeof r == "object" && "length" in r)
    for (; ++f < l; )
      a[f] = Pi(r[f]);
  else {
    const m = Pi(r);
    for (; ++f < l; )
      a[f] = m;
  }
  f = -1;
  const h = [], d = [];
  for (; ++f < l; ) {
    const m = a[f];
    let v = "", k = "";
    m === 99 ? (v = ":", k = ":") : m === 108 ? v = ":" : m === 114 && (k = ":");
    let S = n.alignDelimiters === !1 ? 1 : Math.max(
      1,
      u[f] - v.length - k.length
    );
    const C = v + "-".repeat(S) + k;
    n.alignDelimiters !== !1 && (S = v.length + S + k.length, S > u[f] && (u[f] = S), d[f] = S), h[f] = C;
  }
  s.splice(1, 0, h), o.splice(1, 0, d), c = -1;
  const p = [];
  for (; ++c < s.length; ) {
    const m = s[c], v = o[c];
    f = -1;
    const k = [];
    for (; ++f < l; ) {
      const S = m[f] || "";
      let C = "", N = "";
      if (n.alignDelimiters !== !1) {
        const A = u[f] - (v[f] || 0), b = a[f];
        b === 114 ? C = " ".repeat(A) : b === 99 ? A % 2 ? (C = " ".repeat(A / 2 + 0.5), N = " ".repeat(A / 2 - 0.5)) : (C = " ".repeat(A / 2), N = C) : N = " ".repeat(A);
      }
      n.delimiterStart !== !1 && !f && k.push("|"), n.padding !== !1 && // Don’t add the opening space if we’re not aligning and the cell is
      // empty: there will be a closing space.
      !(n.alignDelimiters === !1 && S === "") && (n.delimiterStart !== !1 || f) && k.push(" "), n.alignDelimiters !== !1 && k.push(C), k.push(S), n.alignDelimiters !== !1 && k.push(N), n.padding !== !1 && k.push(" "), (n.delimiterEnd !== !1 || f !== l - 1) && k.push("|");
    }
    p.push(
      n.delimiterEnd === !1 ? k.join("").replace(/ +$/, "") : k.join("")
    );
  }
  return p.join(`
`);
}
function Vd(e) {
  return e == null ? "" : String(e);
}
function Pi(e) {
  const t = typeof e == "string" ? e.codePointAt(0) : 0;
  return t === 67 || t === 99 ? 99 : t === 76 || t === 108 ? 108 : t === 82 || t === 114 ? 114 : 0;
}
function Hd(e, t, n, r) {
  const i = n.enter("blockquote"), a = n.createTracker(r);
  a.move("> "), a.shift(2);
  const s = n.indentLines(
    n.containerFlow(e, a.current()),
    Ud
  );
  return i(), s;
}
function Ud(e, t, n) {
  return ">" + (n ? "" : " ") + e;
}
function qd(e, t) {
  return Di(e, t.inConstruct, !0) && !Di(e, t.notInConstruct, !1);
}
function Di(e, t, n) {
  if (typeof t == "string" && (t = [t]), !t || t.length === 0)
    return n;
  let r = -1;
  for (; ++r < t.length; )
    if (e.includes(t[r]))
      return !0;
  return !1;
}
function _i(e, t, n, r) {
  let i = -1;
  for (; ++i < n.unsafe.length; )
    if (n.unsafe[i].character === `
` && qd(n.stack, n.unsafe[i]))
      return /[ \t]/.test(r.before) ? "" : " ";
  return `\\
`;
}
function Kd(e, t) {
  const n = String(e);
  let r = n.indexOf(t), i = r, a = 0, s = 0;
  if (typeof t != "string")
    throw new TypeError("Expected substring");
  for (; r !== -1; )
    r === i ? ++a > s && (s = a) : a = 1, i = r + t.length, r = n.indexOf(t, i);
  return s;
}
function Wd(e, t) {
  return !!(t.options.fences === !1 && e.value && // If there’s no info…
  !e.lang && // And there’s a non-whitespace character…
  /[^ \r\n]/.test(e.value) && // And the value doesn’t start or end in a blank…
  !/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(e.value));
}
function Gd(e) {
  const t = e.options.fence || "`";
  if (t !== "`" && t !== "~")
    throw new Error(
      "Cannot serialize code with `" + t + "` for `options.fence`, expected `` ` `` or `~`"
    );
  return t;
}
function Jd(e, t, n, r) {
  const i = Gd(n), a = e.value || "", s = i === "`" ? "GraveAccent" : "Tilde";
  if (Wd(e, n)) {
    const f = n.enter("codeIndented"), h = n.indentLines(a, Yd);
    return f(), h;
  }
  const o = n.createTracker(r), u = i.repeat(Math.max(Kd(a, i) + 1, 3)), l = n.enter("codeFenced");
  let c = o.move(u);
  if (e.lang) {
    const f = n.enter(`codeFencedLang${s}`);
    c += o.move(
      n.safe(e.lang, {
        before: c,
        after: " ",
        encode: ["`"],
        ...o.current()
      })
    ), f();
  }
  if (e.lang && e.meta) {
    const f = n.enter(`codeFencedMeta${s}`);
    c += o.move(" "), c += o.move(
      n.safe(e.meta, {
        before: c,
        after: `
`,
        encode: ["`"],
        ...o.current()
      })
    ), f();
  }
  return c += o.move(`
`), a && (c += o.move(a + `
`)), c += o.move(u), l(), c;
}
function Yd(e, t, n) {
  return (n ? "" : "    ") + e;
}
function mr(e) {
  const t = e.options.quote || '"';
  if (t !== '"' && t !== "'")
    throw new Error(
      "Cannot serialize title with `" + t + "` for `options.quote`, expected `\"`, or `'`"
    );
  return t;
}
function Qd(e, t, n, r) {
  const i = mr(n), a = i === '"' ? "Quote" : "Apostrophe", s = n.enter("definition");
  let o = n.enter("label");
  const u = n.createTracker(r);
  let l = u.move("[");
  return l += u.move(
    n.safe(n.associationId(e), {
      before: l,
      after: "]",
      ...u.current()
    })
  ), l += u.move("]: "), o(), // If there’s no url, or…
  !e.url || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (o = n.enter("destinationLiteral"), l += u.move("<"), l += u.move(
    n.safe(e.url, { before: l, after: ">", ...u.current() })
  ), l += u.move(">")) : (o = n.enter("destinationRaw"), l += u.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : `
`,
      ...u.current()
    })
  )), o(), e.title && (o = n.enter(`title${a}`), l += u.move(" " + i), l += u.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...u.current()
    })
  ), l += u.move(i), o()), s(), l;
}
function Xd(e) {
  const t = e.options.emphasis || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize emphasis with `" + t + "` for `options.emphasis`, expected `*`, or `_`"
    );
  return t;
}
function It(e) {
  return "&#x" + e.toString(16).toUpperCase() + ";";
}
function Gt(e, t, n) {
  const r = st(e), i = st(t);
  return r === void 0 ? i === void 0 ? (
    // Letter inside:
    // we have to encode *both* letters for `_` as it is looser.
    // it already forms for `*` (and GFMs `~`).
    n === "_" ? { inside: !0, outside: !0 } : { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode both (letter, whitespace).
    { inside: !0, outside: !0 }
  ) : (
    // Punctuation inside: encode outer (letter)
    { inside: !1, outside: !0 }
  ) : r === 1 ? i === void 0 ? (
    // Letter inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode both (whitespace).
    { inside: !0, outside: !0 }
  ) : (
    // Punctuation inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === void 0 ? (
    // Letter inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode inner (whitespace).
    { inside: !0, outside: !1 }
  ) : (
    // Punctuation inside: already forms.
    { inside: !1, outside: !1 }
  );
}
Ya.peek = Zd;
function Ya(e, t, n, r) {
  const i = Xd(n), a = n.enter("emphasis"), s = n.createTracker(r), o = s.move(i);
  let u = s.move(
    n.containerPhrasing(e, {
      after: i,
      before: o,
      ...s.current()
    })
  );
  const l = u.charCodeAt(0), c = Gt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  c.inside && (u = It(l) + u.slice(1));
  const f = u.charCodeAt(u.length - 1), h = Gt(r.after.charCodeAt(0), f, i);
  h.inside && (u = u.slice(0, -1) + It(f));
  const d = s.move(i);
  return a(), n.attentionEncodeSurroundingInfo = {
    after: h.outside,
    before: c.outside
  }, o + u + d;
}
function Zd(e, t, n) {
  return n.options.emphasis || "*";
}
function eh(e, t) {
  let n = !1;
  return pr(e, function(r) {
    if ("value" in r && /\r?\n|\r/.test(r.value) || r.type === "break")
      return n = !0, Un;
  }), !!((!e.depth || e.depth < 3) && or(e) && (t.options.setext || n));
}
function th(e, t, n, r) {
  const i = Math.max(Math.min(6, e.depth || 1), 1), a = n.createTracker(r);
  if (eh(e, n)) {
    const c = n.enter("headingSetext"), f = n.enter("phrasing"), h = n.containerPhrasing(e, {
      ...a.current(),
      before: `
`,
      after: `
`
    });
    return f(), c(), h + `
` + (i === 1 ? "=" : "-").repeat(
      // The whole size…
      h.length - // Minus the position of the character after the last EOL (or
      // 0 if there is none)…
      (Math.max(h.lastIndexOf("\r"), h.lastIndexOf(`
`)) + 1)
    );
  }
  const s = "#".repeat(i), o = n.enter("headingAtx"), u = n.enter("phrasing");
  a.move(s + " ");
  let l = n.containerPhrasing(e, {
    before: "# ",
    after: `
`,
    ...a.current()
  });
  return /^[\t ]/.test(l) && (l = It(l.charCodeAt(0)) + l.slice(1)), l = l ? s + " " + l : s, n.options.closeAtx && (l += " " + s), u(), o(), l;
}
Qa.peek = nh;
function Qa(e) {
  return e.value || "";
}
function nh() {
  return "<";
}
Xa.peek = rh;
function Xa(e, t, n, r) {
  const i = mr(n), a = i === '"' ? "Quote" : "Apostrophe", s = n.enter("image");
  let o = n.enter("label");
  const u = n.createTracker(r);
  let l = u.move("![");
  return l += u.move(
    n.safe(e.alt, { before: l, after: "]", ...u.current() })
  ), l += u.move("]("), o(), // If there’s no url but there is a title…
  !e.url && e.title || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (o = n.enter("destinationLiteral"), l += u.move("<"), l += u.move(
    n.safe(e.url, { before: l, after: ">", ...u.current() })
  ), l += u.move(">")) : (o = n.enter("destinationRaw"), l += u.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : ")",
      ...u.current()
    })
  )), o(), e.title && (o = n.enter(`title${a}`), l += u.move(" " + i), l += u.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...u.current()
    })
  ), l += u.move(i), o()), l += u.move(")"), s(), l;
}
function rh() {
  return "!";
}
Za.peek = ih;
function Za(e, t, n, r) {
  const i = e.referenceType, a = n.enter("imageReference");
  let s = n.enter("label");
  const o = n.createTracker(r);
  let u = o.move("![");
  const l = n.safe(e.alt, {
    before: u,
    after: "]",
    ...o.current()
  });
  u += o.move(l + "]["), s();
  const c = n.stack;
  n.stack = [], s = n.enter("reference");
  const f = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...o.current()
  });
  return s(), n.stack = c, a(), i === "full" || !l || l !== f ? u += o.move(f + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += o.move("]"), u;
}
function ih() {
  return "!";
}
es.peek = ah;
function es(e, t, n) {
  let r = e.value || "", i = "`", a = -1;
  for (; new RegExp("(^|[^`])" + i + "([^`]|$)").test(r); )
    i += "`";
  for (/[^ \r\n]/.test(r) && (/^[ \r\n]/.test(r) && /[ \r\n]$/.test(r) || /^`|`$/.test(r)) && (r = " " + r + " "); ++a < n.unsafe.length; ) {
    const s = n.unsafe[a], o = n.compilePattern(s);
    let u;
    if (s.atBreak)
      for (; u = o.exec(r); ) {
        let l = u.index;
        r.charCodeAt(l) === 10 && r.charCodeAt(l - 1) === 13 && l--, r = r.slice(0, l) + " " + r.slice(u.index + 1);
      }
  }
  return i + r + i;
}
function ah() {
  return "`";
}
function ts(e, t) {
  const n = or(e);
  return !!(!t.options.resourceLink && // If there’s a url…
  e.url && // And there’s a no title…
  !e.title && // And the content of `node` is a single text node…
  e.children && e.children.length === 1 && e.children[0].type === "text" && // And if the url is the same as the content…
  (n === e.url || "mailto:" + n === e.url) && // And that starts w/ a protocol…
  /^[a-z][a-z+.-]+:/i.test(e.url) && // And that doesn’t contain ASCII control codes (character escapes and
  // references don’t work), space, or angle brackets…
  !/[\0- <>\u007F]/.test(e.url));
}
ns.peek = sh;
function ns(e, t, n, r) {
  const i = mr(n), a = i === '"' ? "Quote" : "Apostrophe", s = n.createTracker(r);
  let o, u;
  if (ts(e, n)) {
    const c = n.stack;
    n.stack = [], o = n.enter("autolink");
    let f = s.move("<");
    return f += s.move(
      n.containerPhrasing(e, {
        before: f,
        after: ">",
        ...s.current()
      })
    ), f += s.move(">"), o(), n.stack = c, f;
  }
  o = n.enter("link"), u = n.enter("label");
  let l = s.move("[");
  return l += s.move(
    n.containerPhrasing(e, {
      before: l,
      after: "](",
      ...s.current()
    })
  ), l += s.move("]("), u(), // If there’s no url but there is a title…
  !e.url && e.title || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (u = n.enter("destinationLiteral"), l += s.move("<"), l += s.move(
    n.safe(e.url, { before: l, after: ">", ...s.current() })
  ), l += s.move(">")) : (u = n.enter("destinationRaw"), l += s.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : ")",
      ...s.current()
    })
  )), u(), e.title && (u = n.enter(`title${a}`), l += s.move(" " + i), l += s.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...s.current()
    })
  ), l += s.move(i), u()), l += s.move(")"), o(), l;
}
function sh(e, t, n) {
  return ts(e, n) ? "<" : "[";
}
rs.peek = oh;
function rs(e, t, n, r) {
  const i = e.referenceType, a = n.enter("linkReference");
  let s = n.enter("label");
  const o = n.createTracker(r);
  let u = o.move("[");
  const l = n.containerPhrasing(e, {
    before: u,
    after: "]",
    ...o.current()
  });
  u += o.move(l + "]["), s();
  const c = n.stack;
  n.stack = [], s = n.enter("reference");
  const f = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...o.current()
  });
  return s(), n.stack = c, a(), i === "full" || !l || l !== f ? u += o.move(f + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += o.move("]"), u;
}
function oh() {
  return "[";
}
function yr(e) {
  const t = e.options.bullet || "*";
  if (t !== "*" && t !== "+" && t !== "-")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bullet`, expected `*`, `+`, or `-`"
    );
  return t;
}
function lh(e) {
  const t = yr(e), n = e.options.bulletOther;
  if (!n)
    return t === "*" ? "-" : "*";
  if (n !== "*" && n !== "+" && n !== "-")
    throw new Error(
      "Cannot serialize items with `" + n + "` for `options.bulletOther`, expected `*`, `+`, or `-`"
    );
  if (n === t)
    throw new Error(
      "Expected `bullet` (`" + t + "`) and `bulletOther` (`" + n + "`) to be different"
    );
  return n;
}
function uh(e) {
  const t = e.options.bulletOrdered || ".";
  if (t !== "." && t !== ")")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bulletOrdered`, expected `.` or `)`"
    );
  return t;
}
function is(e) {
  const t = e.options.rule || "*";
  if (t !== "*" && t !== "-" && t !== "_")
    throw new Error(
      "Cannot serialize rules with `" + t + "` for `options.rule`, expected `*`, `-`, or `_`"
    );
  return t;
}
function ch(e, t, n, r) {
  const i = n.enter("list"), a = n.bulletCurrent;
  let s = e.ordered ? uh(n) : yr(n);
  const o = e.ordered ? s === "." ? ")" : "." : lh(n);
  let u = t && n.bulletLastUsed ? s === n.bulletLastUsed : !1;
  if (!e.ordered) {
    const c = e.children ? e.children[0] : void 0;
    if (
      // Bullet could be used as a thematic break marker:
      (s === "*" || s === "-") && // Empty first list item:
      c && (!c.children || !c.children[0]) && // Directly in two other list items:
      n.stack[n.stack.length - 1] === "list" && n.stack[n.stack.length - 2] === "listItem" && n.stack[n.stack.length - 3] === "list" && n.stack[n.stack.length - 4] === "listItem" && // That are each the first child.
      n.indexStack[n.indexStack.length - 1] === 0 && n.indexStack[n.indexStack.length - 2] === 0 && n.indexStack[n.indexStack.length - 3] === 0 && (u = !0), is(n) === s && c
    ) {
      let f = -1;
      for (; ++f < e.children.length; ) {
        const h = e.children[f];
        if (h && h.type === "listItem" && h.children && h.children[0] && h.children[0].type === "thematicBreak") {
          u = !0;
          break;
        }
      }
    }
  }
  u && (s = o), n.bulletCurrent = s;
  const l = n.containerFlow(e, r);
  return n.bulletLastUsed = s, n.bulletCurrent = a, i(), l;
}
function fh(e) {
  const t = e.options.listItemIndent || "one";
  if (t !== "tab" && t !== "one" && t !== "mixed")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`"
    );
  return t;
}
function dh(e, t, n, r) {
  const i = fh(n);
  let a = n.bulletCurrent || yr(n);
  t && t.type === "list" && t.ordered && (a = (typeof t.start == "number" && t.start > -1 ? t.start : 1) + (n.options.incrementListMarker === !1 ? 0 : t.children.indexOf(e)) + a);
  let s = a.length + 1;
  (i === "tab" || i === "mixed" && (t && t.type === "list" && t.spread || e.spread)) && (s = Math.ceil(s / 4) * 4);
  const o = n.createTracker(r);
  o.move(a + " ".repeat(s - a.length)), o.shift(s);
  const u = n.enter("listItem"), l = n.indentLines(
    n.containerFlow(e, o.current()),
    c
  );
  return u(), l;
  function c(f, h, d) {
    return h ? (d ? "" : " ".repeat(s)) + f : (d ? a : a + " ".repeat(s - a.length)) + f;
  }
}
function hh(e, t, n, r) {
  const i = n.enter("paragraph"), a = n.enter("phrasing"), s = n.containerPhrasing(e, r);
  return a(), i(), s;
}
const ph = (
  /** @type {(node?: unknown) => node is Exclude<PhrasingContent, Html>} */
  tn([
    "break",
    "delete",
    "emphasis",
    // To do: next major: removed since footnotes were added to GFM.
    "footnote",
    "footnoteReference",
    "image",
    "imageReference",
    "inlineCode",
    // Enabled by `mdast-util-math`:
    "inlineMath",
    "link",
    "linkReference",
    // Enabled by `mdast-util-mdx`:
    "mdxJsxTextElement",
    // Enabled by `mdast-util-mdx`:
    "mdxTextExpression",
    "strong",
    "text",
    // Enabled by `mdast-util-directive`:
    "textDirective"
  ])
);
function gh(e, t, n, r) {
  return (e.children.some(function(s) {
    return ph(s);
  }) ? n.containerPhrasing : n.containerFlow).call(n, e, r);
}
function mh(e) {
  const t = e.options.strong || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize strong with `" + t + "` for `options.strong`, expected `*`, or `_`"
    );
  return t;
}
as.peek = yh;
function as(e, t, n, r) {
  const i = mh(n), a = n.enter("strong"), s = n.createTracker(r), o = s.move(i + i);
  let u = s.move(
    n.containerPhrasing(e, {
      after: i,
      before: o,
      ...s.current()
    })
  );
  const l = u.charCodeAt(0), c = Gt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  c.inside && (u = It(l) + u.slice(1));
  const f = u.charCodeAt(u.length - 1), h = Gt(r.after.charCodeAt(0), f, i);
  h.inside && (u = u.slice(0, -1) + It(f));
  const d = s.move(i + i);
  return a(), n.attentionEncodeSurroundingInfo = {
    after: h.outside,
    before: c.outside
  }, o + u + d;
}
function yh(e, t, n) {
  return n.options.strong || "*";
}
function bh(e, t, n, r) {
  return n.safe(e.value, r);
}
function xh(e) {
  const t = e.options.ruleRepetition || 3;
  if (t < 3)
    throw new Error(
      "Cannot serialize rules with repetition `" + t + "` for `options.ruleRepetition`, expected `3` or more"
    );
  return t;
}
function kh(e, t, n) {
  const r = (is(n) + (n.options.ruleSpaces ? " " : "")).repeat(xh(n));
  return n.options.ruleSpaces ? r.slice(0, -1) : r;
}
const ss = {
  blockquote: Hd,
  break: _i,
  code: Jd,
  definition: Qd,
  emphasis: Ya,
  hardBreak: _i,
  heading: th,
  html: Qa,
  image: Xa,
  imageReference: Za,
  inlineCode: es,
  link: ns,
  linkReference: rs,
  list: ch,
  listItem: dh,
  paragraph: hh,
  root: gh,
  strong: as,
  text: bh,
  thematicBreak: kh
};
function vh() {
  return {
    enter: {
      table: wh,
      tableData: Fi,
      tableHeader: Fi,
      tableRow: Ch
    },
    exit: {
      codeText: Eh,
      table: Sh,
      tableData: Ln,
      tableHeader: Ln,
      tableRow: Ln
    }
  };
}
function wh(e) {
  const t = e._align;
  this.enter(
    {
      type: "table",
      align: t.map(function(n) {
        return n === "none" ? null : n;
      }),
      children: []
    },
    e
  ), this.data.inTable = !0;
}
function Sh(e) {
  this.exit(e), this.data.inTable = void 0;
}
function Ch(e) {
  this.enter({ type: "tableRow", children: [] }, e);
}
function Ln(e) {
  this.exit(e);
}
function Fi(e) {
  this.enter({ type: "tableCell", children: [] }, e);
}
function Eh(e) {
  let t = this.resume();
  this.data.inTable && (t = t.replace(/\\([\\|])/g, Nh));
  const n = this.stack[this.stack.length - 1];
  n.type, n.value = t, this.exit(e);
}
function Nh(e, t) {
  return t === "|" ? t : e;
}
function Ih(e) {
  const t = e || {}, n = t.tableCellPadding, r = t.tablePipeAlign, i = t.stringLength, a = n ? " " : "|";
  return {
    unsafe: [
      { character: "\r", inConstruct: "tableCell" },
      { character: `
`, inConstruct: "tableCell" },
      // A pipe, when followed by a tab or space (padding), or a dash or colon
      // (unpadded delimiter row), could result in a table.
      { atBreak: !0, character: "|", after: "[	 :-]" },
      // A pipe in a cell must be encoded.
      { character: "|", inConstruct: "tableCell" },
      // A colon must be followed by a dash, in which case it could start a
      // delimiter row.
      { atBreak: !0, character: ":", after: "-" },
      // A delimiter row can also start with a dash, when followed by more
      // dashes, a colon, or a pipe.
      // This is a stricter version than the built in check for lists, thematic
      // breaks, and setex heading underlines though:
      // <https://github.com/syntax-tree/mdast-util-to-markdown/blob/51a2038/lib/unsafe.js#L57>
      { atBreak: !0, character: "-", after: "[:|-]" }
    ],
    handlers: {
      inlineCode: h,
      table: s,
      tableCell: u,
      tableRow: o
    }
  };
  function s(d, p, m, v) {
    return l(c(d, m, v), d.align);
  }
  function o(d, p, m, v) {
    const k = f(d, m, v), S = l([k]);
    return S.slice(0, S.indexOf(`
`));
  }
  function u(d, p, m, v) {
    const k = m.enter("tableCell"), S = m.enter("phrasing"), C = m.containerPhrasing(d, {
      ...v,
      before: a,
      after: a
    });
    return S(), k(), C;
  }
  function l(d, p) {
    return Bd(d, {
      align: p,
      // @ts-expect-error: `markdown-table` types should support `null`.
      alignDelimiters: r,
      // @ts-expect-error: `markdown-table` types should support `null`.
      padding: n,
      // @ts-expect-error: `markdown-table` types should support `null`.
      stringLength: i
    });
  }
  function c(d, p, m) {
    const v = d.children;
    let k = -1;
    const S = [], C = p.enter("table");
    for (; ++k < v.length; )
      S[k] = f(v[k], p, m);
    return C(), S;
  }
  function f(d, p, m) {
    const v = d.children;
    let k = -1;
    const S = [], C = p.enter("tableRow");
    for (; ++k < v.length; )
      S[k] = u(v[k], d, p, m);
    return C(), S;
  }
  function h(d, p, m) {
    let v = ss.inlineCode(d, p, m);
    return m.stack.includes("tableCell") && (v = v.replace(/\|/g, "\\$&")), v;
  }
}
function Th() {
  return {
    exit: {
      taskListCheckValueChecked: Mi,
      taskListCheckValueUnchecked: Mi,
      paragraph: Ah
    }
  };
}
function Lh() {
  return {
    unsafe: [{ atBreak: !0, character: "-", after: "[:|-]" }],
    handlers: { listItem: Rh }
  };
}
function Mi(e) {
  const t = this.stack[this.stack.length - 2];
  t.type, t.checked = e.type === "taskListCheckValueChecked";
}
function Ah(e) {
  const t = this.stack[this.stack.length - 2];
  if (t && t.type === "listItem" && typeof t.checked == "boolean") {
    const n = this.stack[this.stack.length - 1];
    n.type;
    const r = n.children[0];
    if (r && r.type === "text") {
      const i = t.children;
      let a = -1, s;
      for (; ++a < i.length; ) {
        const o = i[a];
        if (o.type === "paragraph") {
          s = o;
          break;
        }
      }
      s === n && (r.value = r.value.slice(1), r.value.length === 0 ? n.children.shift() : n.position && r.position && typeof r.position.start.offset == "number" && (r.position.start.column++, r.position.start.offset++, n.position.start = Object.assign({}, r.position.start)));
    }
  }
  this.exit(e);
}
function Rh(e, t, n, r) {
  const i = e.children[0], a = typeof e.checked == "boolean" && i && i.type === "paragraph", s = "[" + (e.checked ? "x" : " ") + "] ", o = n.createTracker(r);
  a && o.move(s);
  let u = ss.listItem(e, t, n, {
    ...r,
    ...o.current()
  });
  return a && (u = u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, l)), u;
  function l(c) {
    return c + s;
  }
}
function Oh() {
  return [
    cd(),
    Rd(),
    _d(),
    vh(),
    Th()
  ];
}
function Ph(e) {
  return {
    extensions: [
      fd(),
      Od(e),
      Fd(),
      Ih(e),
      Lh()
    ]
  };
}
const Dh = {
  tokenize: $h,
  partial: !0
}, os = {
  tokenize: Bh,
  partial: !0
}, ls = {
  tokenize: Vh,
  partial: !0
}, us = {
  tokenize: Hh,
  partial: !0
}, _h = {
  tokenize: Uh,
  partial: !0
}, cs = {
  name: "wwwAutolink",
  tokenize: zh,
  previous: ds
}, fs = {
  name: "protocolAutolink",
  tokenize: jh,
  previous: hs
}, Fe = {
  name: "emailAutolink",
  tokenize: Mh,
  previous: ps
}, Ae = {};
function Fh() {
  return {
    text: Ae
  };
}
let Ue = 48;
for (; Ue < 123; )
  Ae[Ue] = Fe, Ue++, Ue === 58 ? Ue = 65 : Ue === 91 && (Ue = 97);
Ae[43] = Fe;
Ae[45] = Fe;
Ae[46] = Fe;
Ae[95] = Fe;
Ae[72] = [Fe, fs];
Ae[104] = [Fe, fs];
Ae[87] = [Fe, cs];
Ae[119] = [Fe, cs];
function Mh(e, t, n) {
  const r = this;
  let i, a;
  return s;
  function s(f) {
    return !Gn(f) || !ps.call(r, r.previous) || br(r.events) ? n(f) : (e.enter("literalAutolink"), e.enter("literalAutolinkEmail"), o(f));
  }
  function o(f) {
    return Gn(f) ? (e.consume(f), o) : f === 64 ? (e.consume(f), u) : n(f);
  }
  function u(f) {
    return f === 46 ? e.check(_h, c, l)(f) : f === 45 || f === 95 || ce(f) ? (a = !0, e.consume(f), u) : c(f);
  }
  function l(f) {
    return e.consume(f), i = !0, u;
  }
  function c(f) {
    return a && i && de(r.previous) ? (e.exit("literalAutolinkEmail"), e.exit("literalAutolink"), t(f)) : n(f);
  }
}
function zh(e, t, n) {
  const r = this;
  return i;
  function i(s) {
    return s !== 87 && s !== 119 || !ds.call(r, r.previous) || br(r.events) ? n(s) : (e.enter("literalAutolink"), e.enter("literalAutolinkWww"), e.check(Dh, e.attempt(os, e.attempt(ls, a), n), n)(s));
  }
  function a(s) {
    return e.exit("literalAutolinkWww"), e.exit("literalAutolink"), t(s);
  }
}
function jh(e, t, n) {
  const r = this;
  let i = "", a = !1;
  return s;
  function s(f) {
    return (f === 72 || f === 104) && hs.call(r, r.previous) && !br(r.events) ? (e.enter("literalAutolink"), e.enter("literalAutolinkHttp"), i += String.fromCodePoint(f), e.consume(f), o) : n(f);
  }
  function o(f) {
    if (de(f) && i.length < 5)
      return i += String.fromCodePoint(f), e.consume(f), o;
    if (f === 58) {
      const h = i.toLowerCase();
      if (h === "http" || h === "https")
        return e.consume(f), u;
    }
    return n(f);
  }
  function u(f) {
    return f === 47 ? (e.consume(f), a ? l : (a = !0, u)) : n(f);
  }
  function l(f) {
    return f === null || qt(f) || Z(f) || Je(f) || Xt(f) ? n(f) : e.attempt(os, e.attempt(ls, c), n)(f);
  }
  function c(f) {
    return e.exit("literalAutolinkHttp"), e.exit("literalAutolink"), t(f);
  }
}
function $h(e, t, n) {
  let r = 0;
  return i;
  function i(s) {
    return (s === 87 || s === 119) && r < 3 ? (r++, e.consume(s), i) : s === 46 && r === 3 ? (e.consume(s), a) : n(s);
  }
  function a(s) {
    return s === null ? n(s) : t(s);
  }
}
function Bh(e, t, n) {
  let r, i, a;
  return s;
  function s(l) {
    return l === 46 || l === 95 ? e.check(us, u, o)(l) : l === null || Z(l) || Je(l) || l !== 45 && Xt(l) ? u(l) : (a = !0, e.consume(l), s);
  }
  function o(l) {
    return l === 95 ? r = !0 : (i = r, r = void 0), e.consume(l), s;
  }
  function u(l) {
    return i || r || !a ? n(l) : t(l);
  }
}
function Vh(e, t) {
  let n = 0, r = 0;
  return i;
  function i(s) {
    return s === 40 ? (n++, e.consume(s), i) : s === 41 && r < n ? a(s) : s === 33 || s === 34 || s === 38 || s === 39 || s === 41 || s === 42 || s === 44 || s === 46 || s === 58 || s === 59 || s === 60 || s === 63 || s === 93 || s === 95 || s === 126 ? e.check(us, t, a)(s) : s === null || Z(s) || Je(s) ? t(s) : (e.consume(s), i);
  }
  function a(s) {
    return s === 41 && r++, e.consume(s), i;
  }
}
function Hh(e, t, n) {
  return r;
  function r(o) {
    return o === 33 || o === 34 || o === 39 || o === 41 || o === 42 || o === 44 || o === 46 || o === 58 || o === 59 || o === 63 || o === 95 || o === 126 ? (e.consume(o), r) : o === 38 ? (e.consume(o), a) : o === 93 ? (e.consume(o), i) : (
      // `<` is an end.
      o === 60 || // So is whitespace.
      o === null || Z(o) || Je(o) ? t(o) : n(o)
    );
  }
  function i(o) {
    return o === null || o === 40 || o === 91 || Z(o) || Je(o) ? t(o) : r(o);
  }
  function a(o) {
    return de(o) ? s(o) : n(o);
  }
  function s(o) {
    return o === 59 ? (e.consume(o), r) : de(o) ? (e.consume(o), s) : n(o);
  }
}
function Uh(e, t, n) {
  return r;
  function r(a) {
    return e.consume(a), i;
  }
  function i(a) {
    return ce(a) ? n(a) : t(a);
  }
}
function ds(e) {
  return e === null || e === 40 || e === 42 || e === 95 || e === 91 || e === 93 || e === 126 || Z(e);
}
function hs(e) {
  return !de(e);
}
function ps(e) {
  return !(e === 47 || Gn(e));
}
function Gn(e) {
  return e === 43 || e === 45 || e === 46 || e === 95 || ce(e);
}
function br(e) {
  let t = e.length, n = !1;
  for (; t--; ) {
    const r = e[t][1];
    if ((r.type === "labelLink" || r.type === "labelImage") && !r._balanced) {
      n = !0;
      break;
    }
    if (r._gfmAutolinkLiteralWalkedInto) {
      n = !1;
      break;
    }
  }
  return e.length > 0 && !n && (e[e.length - 1][1]._gfmAutolinkLiteralWalkedInto = !0), n;
}
const qh = {
  tokenize: Zh,
  partial: !0
};
function Kh() {
  return {
    document: {
      91: {
        name: "gfmFootnoteDefinition",
        tokenize: Yh,
        continuation: {
          tokenize: Qh
        },
        exit: Xh
      }
    },
    text: {
      91: {
        name: "gfmFootnoteCall",
        tokenize: Jh
      },
      93: {
        name: "gfmPotentialFootnoteCall",
        add: "after",
        tokenize: Wh,
        resolveTo: Gh
      }
    }
  };
}
function Wh(e, t, n) {
  const r = this;
  let i = r.events.length;
  const a = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s;
  for (; i--; ) {
    const u = r.events[i][1];
    if (u.type === "labelImage") {
      s = u;
      break;
    }
    if (u.type === "gfmFootnoteCall" || u.type === "labelLink" || u.type === "label" || u.type === "image" || u.type === "link")
      break;
  }
  return o;
  function o(u) {
    if (!s || !s._balanced)
      return n(u);
    const l = Ne(r.sliceSerialize({
      start: s.end,
      end: r.now()
    }));
    return l.codePointAt(0) !== 94 || !a.includes(l.slice(1)) ? n(u) : (e.enter("gfmFootnoteCallLabelMarker"), e.consume(u), e.exit("gfmFootnoteCallLabelMarker"), t(u));
  }
}
function Gh(e, t) {
  let n = e.length;
  for (; n--; )
    if (e[n][1].type === "labelImage" && e[n][0] === "enter") {
      e[n][1];
      break;
    }
  e[n + 1][1].type = "data", e[n + 3][1].type = "gfmFootnoteCallLabelMarker";
  const r = {
    type: "gfmFootnoteCall",
    start: Object.assign({}, e[n + 3][1].start),
    end: Object.assign({}, e[e.length - 1][1].end)
  }, i = {
    type: "gfmFootnoteCallMarker",
    start: Object.assign({}, e[n + 3][1].end),
    end: Object.assign({}, e[n + 3][1].end)
  };
  i.end.column++, i.end.offset++, i.end._bufferIndex++;
  const a = {
    type: "gfmFootnoteCallString",
    start: Object.assign({}, i.end),
    end: Object.assign({}, e[e.length - 1][1].start)
  }, s = {
    type: "chunkString",
    contentType: "string",
    start: Object.assign({}, a.start),
    end: Object.assign({}, a.end)
  }, o = [
    // Take the `labelImageMarker` (now `data`, the `!`)
    e[n + 1],
    e[n + 2],
    ["enter", r, t],
    // The `[`
    e[n + 3],
    e[n + 4],
    // The `^`.
    ["enter", i, t],
    ["exit", i, t],
    // Everything in between.
    ["enter", a, t],
    ["enter", s, t],
    ["exit", s, t],
    ["exit", a, t],
    // The ending (`]`, properly parsed and labelled).
    e[e.length - 2],
    e[e.length - 1],
    ["exit", r, t]
  ];
  return e.splice(n, e.length - n + 1, ...o), e;
}
function Jh(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let a = 0, s;
  return o;
  function o(f) {
    return e.enter("gfmFootnoteCall"), e.enter("gfmFootnoteCallLabelMarker"), e.consume(f), e.exit("gfmFootnoteCallLabelMarker"), u;
  }
  function u(f) {
    return f !== 94 ? n(f) : (e.enter("gfmFootnoteCallMarker"), e.consume(f), e.exit("gfmFootnoteCallMarker"), e.enter("gfmFootnoteCallString"), e.enter("chunkString").contentType = "string", l);
  }
  function l(f) {
    if (
      // Too long.
      a > 999 || // Closing brace with nothing.
      f === 93 && !s || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      f === null || f === 91 || Z(f)
    )
      return n(f);
    if (f === 93) {
      e.exit("chunkString");
      const h = e.exit("gfmFootnoteCallString");
      return i.includes(Ne(r.sliceSerialize(h))) ? (e.enter("gfmFootnoteCallLabelMarker"), e.consume(f), e.exit("gfmFootnoteCallLabelMarker"), e.exit("gfmFootnoteCall"), t) : n(f);
    }
    return Z(f) || (s = !0), a++, e.consume(f), f === 92 ? c : l;
  }
  function c(f) {
    return f === 91 || f === 92 || f === 93 ? (e.consume(f), a++, l) : l(f);
  }
}
function Yh(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let a, s = 0, o;
  return u;
  function u(p) {
    return e.enter("gfmFootnoteDefinition")._container = !0, e.enter("gfmFootnoteDefinitionLabel"), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), l;
  }
  function l(p) {
    return p === 94 ? (e.enter("gfmFootnoteDefinitionMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionMarker"), e.enter("gfmFootnoteDefinitionLabelString"), e.enter("chunkString").contentType = "string", c) : n(p);
  }
  function c(p) {
    if (
      // Too long.
      s > 999 || // Closing brace with nothing.
      p === 93 && !o || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      p === null || p === 91 || Z(p)
    )
      return n(p);
    if (p === 93) {
      e.exit("chunkString");
      const m = e.exit("gfmFootnoteDefinitionLabelString");
      return a = Ne(r.sliceSerialize(m)), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), e.exit("gfmFootnoteDefinitionLabel"), h;
    }
    return Z(p) || (o = !0), s++, e.consume(p), p === 92 ? f : c;
  }
  function f(p) {
    return p === 91 || p === 92 || p === 93 ? (e.consume(p), s++, c) : c(p);
  }
  function h(p) {
    return p === 58 ? (e.enter("definitionMarker"), e.consume(p), e.exit("definitionMarker"), i.includes(a) || i.push(a), W(e, d, "gfmFootnoteDefinitionWhitespace")) : n(p);
  }
  function d(p) {
    return t(p);
  }
}
function Qh(e, t, n) {
  return e.check(Lt, t, e.attempt(qh, t, n));
}
function Xh(e) {
  e.exit("gfmFootnoteDefinition");
}
function Zh(e, t, n) {
  const r = this;
  return W(e, i, "gfmFootnoteDefinitionIndent", 5);
  function i(a) {
    const s = r.events[r.events.length - 1];
    return s && s[1].type === "gfmFootnoteDefinitionIndent" && s[2].sliceSerialize(s[1], !0).length === 4 ? t(a) : n(a);
  }
}
function ep(e) {
  let n = (e || {}).singleTilde;
  const r = {
    name: "strikethrough",
    tokenize: a,
    resolveAll: i
  };
  return n == null && (n = !0), {
    text: {
      126: r
    },
    insideSpan: {
      null: [r]
    },
    attentionMarkers: {
      null: [126]
    }
  };
  function i(s, o) {
    let u = -1;
    for (; ++u < s.length; )
      if (s[u][0] === "enter" && s[u][1].type === "strikethroughSequenceTemporary" && s[u][1]._close) {
        let l = u;
        for (; l--; )
          if (s[l][0] === "exit" && s[l][1].type === "strikethroughSequenceTemporary" && s[l][1]._open && // If the sizes are the same:
          s[u][1].end.offset - s[u][1].start.offset === s[l][1].end.offset - s[l][1].start.offset) {
            s[u][1].type = "strikethroughSequence", s[l][1].type = "strikethroughSequence";
            const c = {
              type: "strikethrough",
              start: Object.assign({}, s[l][1].start),
              end: Object.assign({}, s[u][1].end)
            }, f = {
              type: "strikethroughText",
              start: Object.assign({}, s[l][1].end),
              end: Object.assign({}, s[u][1].start)
            }, h = [["enter", c, o], ["enter", s[l][1], o], ["exit", s[l][1], o], ["enter", f, o]], d = o.parser.constructs.insideSpan.null;
            d && ke(h, h.length, 0, Zt(d, s.slice(l + 1, u), o)), ke(h, h.length, 0, [["exit", f, o], ["enter", s[u][1], o], ["exit", s[u][1], o], ["exit", c, o]]), ke(s, l - 1, u - l + 3, h), u = l + h.length - 2;
            break;
          }
      }
    for (u = -1; ++u < s.length; )
      s[u][1].type === "strikethroughSequenceTemporary" && (s[u][1].type = "data");
    return s;
  }
  function a(s, o, u) {
    const l = this.previous, c = this.events;
    let f = 0;
    return h;
    function h(p) {
      return l === 126 && c[c.length - 1][1].type !== "characterEscape" ? u(p) : (s.enter("strikethroughSequenceTemporary"), d(p));
    }
    function d(p) {
      const m = st(l);
      if (p === 126)
        return f > 1 ? u(p) : (s.consume(p), f++, d);
      if (f < 2 && !n) return u(p);
      const v = s.exit("strikethroughSequenceTemporary"), k = st(p);
      return v._open = !k || k === 2 && !!m, v._close = !m || m === 2 && !!k, o(p);
    }
  }
}
class tp {
  /**
   * Create a new edit map.
   */
  constructor() {
    this.map = [];
  }
  /**
   * Create an edit: a remove and/or add at a certain place.
   *
   * @param {number} index
   * @param {number} remove
   * @param {Array<Event>} add
   * @returns {undefined}
   */
  add(t, n, r) {
    np(this, t, n, r);
  }
  // To do: add this when moving to `micromark`.
  // /**
  //  * Create an edit: but insert `add` before existing additions.
  //  *
  //  * @param {number} index
  //  * @param {number} remove
  //  * @param {Array<Event>} add
  //  * @returns {undefined}
  //  */
  // addBefore(index, remove, add) {
  //   addImplementation(this, index, remove, add, true)
  // }
  /**
   * Done, change the events.
   *
   * @param {Array<Event>} events
   * @returns {undefined}
   */
  consume(t) {
    if (this.map.sort(function(a, s) {
      return a[0] - s[0];
    }), this.map.length === 0)
      return;
    let n = this.map.length;
    const r = [];
    for (; n > 0; )
      n -= 1, r.push(t.slice(this.map[n][0] + this.map[n][1]), this.map[n][2]), t.length = this.map[n][0];
    r.push(t.slice()), t.length = 0;
    let i = r.pop();
    for (; i; ) {
      for (const a of i)
        t.push(a);
      i = r.pop();
    }
    this.map.length = 0;
  }
}
function np(e, t, n, r) {
  let i = 0;
  if (!(n === 0 && r.length === 0)) {
    for (; i < e.map.length; ) {
      if (e.map[i][0] === t) {
        e.map[i][1] += n, e.map[i][2].push(...r);
        return;
      }
      i += 1;
    }
    e.map.push([t, n, r]);
  }
}
function rp(e, t) {
  let n = !1;
  const r = [];
  for (; t < e.length; ) {
    const i = e[t];
    if (n) {
      if (i[0] === "enter")
        i[1].type === "tableContent" && r.push(e[t + 1][1].type === "tableDelimiterMarker" ? "left" : "none");
      else if (i[1].type === "tableContent") {
        if (e[t - 1][1].type === "tableDelimiterMarker") {
          const a = r.length - 1;
          r[a] = r[a] === "left" ? "center" : "right";
        }
      } else if (i[1].type === "tableDelimiterRow")
        break;
    } else i[0] === "enter" && i[1].type === "tableDelimiterRow" && (n = !0);
    t += 1;
  }
  return r;
}
function ip() {
  return {
    flow: {
      null: {
        name: "table",
        tokenize: ap,
        resolveAll: sp
      }
    }
  };
}
function ap(e, t, n) {
  const r = this;
  let i = 0, a = 0, s;
  return o;
  function o(w) {
    let R = r.events.length - 1;
    for (; R > -1; ) {
      const _ = r.events[R][1].type;
      if (_ === "lineEnding" || // Note: markdown-rs uses `whitespace` instead of `linePrefix`
      _ === "linePrefix") R--;
      else break;
    }
    const D = R > -1 ? r.events[R][1].type : null, z = D === "tableHead" || D === "tableRow" ? b : u;
    return z === b && r.parser.lazy[r.now().line] ? n(w) : z(w);
  }
  function u(w) {
    return e.enter("tableHead"), e.enter("tableRow"), l(w);
  }
  function l(w) {
    return w === 124 || (s = !0, a += 1), c(w);
  }
  function c(w) {
    return w === null ? n(w) : j(w) ? a > 1 ? (a = 0, r.interrupt = !0, e.exit("tableRow"), e.enter("lineEnding"), e.consume(w), e.exit("lineEnding"), d) : n(w) : U(w) ? W(e, c, "whitespace")(w) : (a += 1, s && (s = !1, i += 1), w === 124 ? (e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), s = !0, c) : (e.enter("data"), f(w)));
  }
  function f(w) {
    return w === null || w === 124 || Z(w) ? (e.exit("data"), c(w)) : (e.consume(w), w === 92 ? h : f);
  }
  function h(w) {
    return w === 92 || w === 124 ? (e.consume(w), f) : f(w);
  }
  function d(w) {
    return r.interrupt = !1, r.parser.lazy[r.now().line] ? n(w) : (e.enter("tableDelimiterRow"), s = !1, U(w) ? W(e, p, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(w) : p(w));
  }
  function p(w) {
    return w === 45 || w === 58 ? v(w) : w === 124 ? (s = !0, e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), m) : A(w);
  }
  function m(w) {
    return U(w) ? W(e, v, "whitespace")(w) : v(w);
  }
  function v(w) {
    return w === 58 ? (a += 1, s = !0, e.enter("tableDelimiterMarker"), e.consume(w), e.exit("tableDelimiterMarker"), k) : w === 45 ? (a += 1, k(w)) : w === null || j(w) ? N(w) : A(w);
  }
  function k(w) {
    return w === 45 ? (e.enter("tableDelimiterFiller"), S(w)) : A(w);
  }
  function S(w) {
    return w === 45 ? (e.consume(w), S) : w === 58 ? (s = !0, e.exit("tableDelimiterFiller"), e.enter("tableDelimiterMarker"), e.consume(w), e.exit("tableDelimiterMarker"), C) : (e.exit("tableDelimiterFiller"), C(w));
  }
  function C(w) {
    return U(w) ? W(e, N, "whitespace")(w) : N(w);
  }
  function N(w) {
    return w === 124 ? p(w) : w === null || j(w) ? !s || i !== a ? A(w) : (e.exit("tableDelimiterRow"), e.exit("tableHead"), t(w)) : A(w);
  }
  function A(w) {
    return n(w);
  }
  function b(w) {
    return e.enter("tableRow"), I(w);
  }
  function I(w) {
    return w === 124 ? (e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), I) : w === null || j(w) ? (e.exit("tableRow"), t(w)) : U(w) ? W(e, I, "whitespace")(w) : (e.enter("data"), M(w));
  }
  function M(w) {
    return w === null || w === 124 || Z(w) ? (e.exit("data"), I(w)) : (e.consume(w), w === 92 ? F : M);
  }
  function F(w) {
    return w === 92 || w === 124 ? (e.consume(w), M) : M(w);
  }
}
function sp(e, t) {
  let n = -1, r = !0, i = 0, a = [0, 0, 0, 0], s = [0, 0, 0, 0], o = !1, u = 0, l, c, f;
  const h = new tp();
  for (; ++n < e.length; ) {
    const d = e[n], p = d[1];
    d[0] === "enter" ? p.type === "tableHead" ? (o = !1, u !== 0 && (zi(h, t, u, l, c), c = void 0, u = 0), l = {
      type: "table",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, h.add(n, 0, [["enter", l, t]])) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (r = !0, f = void 0, a = [0, 0, 0, 0], s = [0, n + 1, 0, 0], o && (o = !1, c = {
      type: "tableBody",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, h.add(n, 0, [["enter", c, t]])), i = p.type === "tableDelimiterRow" ? 2 : c ? 3 : 1) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") ? (r = !1, s[2] === 0 && (a[1] !== 0 && (s[0] = s[1], f = Mt(h, t, a, i, void 0, f), a = [0, 0, 0, 0]), s[2] = n)) : p.type === "tableCellDivider" && (r ? r = !1 : (a[1] !== 0 && (s[0] = s[1], f = Mt(h, t, a, i, void 0, f)), a = s, s = [a[1], n, 0, 0])) : p.type === "tableHead" ? (o = !0, u = n) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (u = n, a[1] !== 0 ? (s[0] = s[1], f = Mt(h, t, a, i, n, f)) : s[1] !== 0 && (f = Mt(h, t, s, i, n, f)), i = 0) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") && (s[3] = n);
  }
  for (u !== 0 && zi(h, t, u, l, c), h.consume(t.events), n = -1; ++n < t.events.length; ) {
    const d = t.events[n];
    d[0] === "enter" && d[1].type === "table" && (d[1]._align = rp(t.events, n));
  }
  return e;
}
function Mt(e, t, n, r, i, a) {
  const s = r === 1 ? "tableHeader" : r === 2 ? "tableDelimiter" : "tableData", o = "tableContent";
  n[0] !== 0 && (a.end = Object.assign({}, it(t.events, n[0])), e.add(n[0], 0, [["exit", a, t]]));
  const u = it(t.events, n[1]);
  if (a = {
    type: s,
    start: Object.assign({}, u),
    // Note: correct end is set later.
    end: Object.assign({}, u)
  }, e.add(n[1], 0, [["enter", a, t]]), n[2] !== 0) {
    const l = it(t.events, n[2]), c = it(t.events, n[3]), f = {
      type: o,
      start: Object.assign({}, l),
      end: Object.assign({}, c)
    };
    if (e.add(n[2], 0, [["enter", f, t]]), r !== 2) {
      const h = t.events[n[2]], d = t.events[n[3]];
      if (h[1].end = Object.assign({}, d[1].end), h[1].type = "chunkText", h[1].contentType = "text", n[3] > n[2] + 1) {
        const p = n[2] + 1, m = n[3] - n[2] - 1;
        e.add(p, m, []);
      }
    }
    e.add(n[3] + 1, 0, [["exit", f, t]]);
  }
  return i !== void 0 && (a.end = Object.assign({}, it(t.events, i)), e.add(i, 0, [["exit", a, t]]), a = void 0), a;
}
function zi(e, t, n, r, i) {
  const a = [], s = it(t.events, n);
  i && (i.end = Object.assign({}, s), a.push(["exit", i, t])), r.end = Object.assign({}, s), a.push(["exit", r, t]), e.add(n + 1, 0, a);
}
function it(e, t) {
  const n = e[t], r = n[0] === "enter" ? "start" : "end";
  return n[1][r];
}
const op = {
  name: "tasklistCheck",
  tokenize: up
};
function lp() {
  return {
    text: {
      91: op
    }
  };
}
function up(e, t, n) {
  const r = this;
  return i;
  function i(u) {
    return (
      // Exit if there’s stuff before.
      r.previous !== null || // Exit if not in the first content that is the first child of a list
      // item.
      !r._gfmTasklistFirstContentOfListItem ? n(u) : (e.enter("taskListCheck"), e.enter("taskListCheckMarker"), e.consume(u), e.exit("taskListCheckMarker"), a)
    );
  }
  function a(u) {
    return Z(u) ? (e.enter("taskListCheckValueUnchecked"), e.consume(u), e.exit("taskListCheckValueUnchecked"), s) : u === 88 || u === 120 ? (e.enter("taskListCheckValueChecked"), e.consume(u), e.exit("taskListCheckValueChecked"), s) : n(u);
  }
  function s(u) {
    return u === 93 ? (e.enter("taskListCheckMarker"), e.consume(u), e.exit("taskListCheckMarker"), e.exit("taskListCheck"), o) : n(u);
  }
  function o(u) {
    return j(u) ? t(u) : U(u) ? e.check({
      tokenize: cp
    }, t, n)(u) : n(u);
  }
}
function cp(e, t, n) {
  return W(e, r, "whitespace");
  function r(i) {
    return i === null ? n(i) : t(i);
  }
}
function fp(e) {
  return Ca([
    Fh(),
    Kh(),
    ep(e),
    ip(),
    lp()
  ]);
}
const dp = {};
function hp(e) {
  const t = (
    /** @type {Processor<Root>} */
    this
  ), n = e || dp, r = t.data(), i = r.micromarkExtensions || (r.micromarkExtensions = []), a = r.fromMarkdownExtensions || (r.fromMarkdownExtensions = []), s = r.toMarkdownExtensions || (r.toMarkdownExtensions = []);
  i.push(fp(n)), a.push(Oh()), s.push(Ph(n));
}
const pp = {
  a: ({ node: e, ...t }) => /* @__PURE__ */ g("a", { target: "_blank", rel: "noopener noreferrer", ...t }),
  // react-markdown v10 removed the `inline` prop; detect inline via the absence
  // of a language- className and of newlines (block code lives inside <pre>).
  code: ({ node: e, className: t, children: n, ...r }) => !/^language-/.test(t || "") && !String(n).includes(`
`) ? /* @__PURE__ */ g("code", { className: "fdv2-md-code-inline", ...r, children: n }) : /* @__PURE__ */ g("code", { className: t, ...r, children: n }),
  table: ({ node: e, ...t }) => /* @__PURE__ */ g("div", { className: "fdv2-md-table-wrap", children: /* @__PURE__ */ g("table", { ...t }) })
};
function gp({ children: e }) {
  return /* @__PURE__ */ g("div", { className: "fdv2-md", children: /* @__PURE__ */ g(ed, { remarkPlugins: [hp], components: pp, children: e || "" }) });
}
function An(e, t) {
  return t ? e === "beneficiary" ? `${t.name || t.userId}${t.email ? ` (${t.email})` : ""}` : t.name || t.code || "" : "";
}
function mp({ resolveChoices: e }) {
  const { t } = ee(), { loading: n } = Ce(), r = _e(), [i, a] = ne(null), [s, o] = ne(""), { slotId: u, default: l, alternatives: c = [], allowSearch: f } = e, h = () => r.sendChoice({ slotId: u, action: "confirm", value: l }, An(u, l)), d = (m) => r.sendChoice({ slotId: u, action: "select", value: m }, An(u, m)), p = () => {
    const m = s.trim();
    m && r.sendChoice({ slotId: u, action: "search", value: m }, m);
  };
  return /* @__PURE__ */ T("div", { className: "fdv2-choice", children: [
    /* @__PURE__ */ T("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", onClick: h, disabled: n, children: t("choice.yes") }),
      c.length > 0 && /* @__PURE__ */ T("button", { type: "button", className: "fdv2-choice-btn", onClick: () => a(i === "list" ? null : "list"), disabled: n, children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      f && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", onClick: () => a(i === "search" ? null : "search"), disabled: n, children: t("choice.search") })
    ] }),
    i === "list" && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: c.map((m, v) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ g("button", { type: "button", onClick: () => d(m), disabled: n, children: An(u, m) }) }, m.userId || m.code || v)) }),
    i === "search" && /* @__PURE__ */ T("div", { className: "fdv2-choice-search", children: [
      /* @__PURE__ */ g(
        "input",
        {
          className: "fdv2-slot-input",
          value: s,
          onChange: (m) => o(m.target.value),
          onKeyDown: (m) => {
            m.key === "Enter" && (m.preventDefault(), p());
          },
          placeholder: t(u === "location" ? "choice.searchLocation" : "choice.searchUser"),
          disabled: n,
          autoFocus: !0
        }
      ),
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", onClick: p, disabled: n || !s.trim(), children: t("choice.find") })
    ] })
  ] });
}
function ji({ control: e, onPick: t, onCommit: n }) {
  const { t: r } = ee(), { loading: i } = Ce(), a = e.source || {}, s = a.minChars || 2, o = a.directory || "user", u = e.multi === !0, [l, c] = ne(() => Array.isArray(e.selected) ? e.selected : []), f = (b) => l.some((I) => String(I.value ?? I.userId ?? I.id) === String(b.value)), [h, d] = ne(""), [p, m] = ne([]), [v, k] = ne(!1), S = ae(null);
  te(() => {
    const b = h.trim();
    if (b.length < s) {
      m([]), k(!1);
      return;
    }
    return k(!0), clearTimeout(S.current), S.current = setTimeout(async () => {
      try {
        const M = await (await De()(
          Zn(`/flowdesk/directory/${encodeURIComponent(o)}?q=${encodeURIComponent(b)}&limit=8`),
          { headers: await Le() }
        )).json().catch(() => ({}));
        m(Array.isArray(M.results) ? M.results : []);
      } catch {
        m([]);
      } finally {
        k(!1);
      }
    }, 300), () => clearTimeout(S.current);
  }, [h, s, o]);
  const C = a.placeholder || r(o === "location" ? "choice.searchLocation" : "choice.searchUser"), N = (b) => {
    if (!u) {
      t(b);
      return;
    }
    f(b) || c([...l, b]), d(""), m([]);
  }, A = (b) => c(l.filter((I) => String(I.value ?? I.userId ?? I.id) !== String(b)));
  return /* @__PURE__ */ T("div", { className: "fdv2-autocomplete fdv2-choice-search", children: [
    u && l.length > 0 && /* @__PURE__ */ g("ul", { className: "fdv2-ac-chips", children: l.map((b) => {
      const I = b.value ?? b.userId ?? b.id;
      return /* @__PURE__ */ T("li", { className: "fdv2-ac-chip", children: [
        /* @__PURE__ */ g("span", { children: b.label || b.name || I }),
        /* @__PURE__ */ g("button", { type: "button", "aria-label": r("choice.cancel"), disabled: i, onClick: () => A(I), children: "✕" })
      ] }, I);
    }) }),
    /* @__PURE__ */ g(
      "input",
      {
        className: "fdv2-slot-input",
        value: h,
        onChange: (b) => d(b.target.value),
        placeholder: C,
        disabled: i,
        autoFocus: !0
      }
    ),
    v && /* @__PURE__ */ g("span", { className: "fdv2-ac-loading", "aria-hidden": "true", children: "…" }),
    p.length > 0 && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: p.map((b) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ T("button", { type: "button", disabled: i || u && f(b), onClick: () => N(b), children: [
      b.label,
      b.sublabel ? ` — ${b.sublabel}` : ""
    ] }) }, b.value)) }),
    u && /* @__PURE__ */ g("div", { className: "fdv2-ac-actions", children: /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: i,
        onClick: () => n(l),
        children: l.length ? r("choice.done", { count: l.length }) : r("choice.skip")
      }
    ) })
  ] });
}
function yp({ control: e, onSelect: t }) {
  const { t: n } = ee(), { loading: r } = Ce(), [i, a] = ne(e.prefill || "");
  return /* @__PURE__ */ T("div", { className: "fdv2-date-control fdv2-choice-row", children: [
    /* @__PURE__ */ g(
      "input",
      {
        type: "date",
        className: "fdv2-slot-input fdv2-date-input",
        value: i,
        onChange: (o) => a(o.target.value),
        disabled: r
      }
    ),
    /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: r || !i,
        onClick: () => {
          i && t(i);
        },
        children: n("date.set")
      }
    )
  ] });
}
function bp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = Ce(), i = e.options || [], [a, s] = ne(() => new Set(e.selected || [])), o = (l) => {
    s((c) => {
      const f = new Set(c);
      return f.has(l) ? f.delete(l) : f.add(l), f;
    });
  }, u = () => {
    const l = i.map((c) => c.value).filter((c) => a.has(c));
    l.length && t(l);
  };
  return /* @__PURE__ */ T("div", { className: "fdv2-multichoice-control", children: [
    /* @__PURE__ */ g("ul", { className: "fdv2-multichoice-list", children: i.map((l) => /* @__PURE__ */ g("li", { className: "fdv2-multichoice-option", children: /* @__PURE__ */ T("label", { children: [
      /* @__PURE__ */ g(
        "input",
        {
          type: "checkbox",
          checked: a.has(l.value),
          disabled: r,
          onChange: () => o(l.value)
        }
      ),
      /* @__PURE__ */ T("span", { children: [
        l.label,
        l.description ? ` — ${l.description}` : ""
      ] })
    ] }) }, l.value)) }),
    /* @__PURE__ */ T("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-confirm",
          disabled: r || a.size === 0,
          onClick: u,
          children: n("multichoice.confirm")
        }
      ),
      a.size > 0 && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: r, onClick: () => s(/* @__PURE__ */ new Set()), children: n("multichoice.clear") })
    ] })
  ] });
}
function xp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = Ce(), { type: i, placeholder: a, prefill: s, rows: o } = e, [u, l] = ne(s != null ? String(s) : ""), c = i === "textarea", f = !r && String(u).trim() !== "", h = () => {
    f && t(u);
  }, p = {
    className: "fdv2-slot-input",
    value: u,
    placeholder: a || void 0,
    disabled: r,
    onChange: (m) => l(m.target.value),
    onKeyDown: (m) => {
      m.key === "Enter" && (c && !(m.ctrlKey || m.metaKey) || (m.preventDefault(), h()));
    }
  };
  return /* @__PURE__ */ T("div", { className: `fdv2-freeinput-control fdv2-freeinput-${i}`, children: [
    c ? /* @__PURE__ */ g("textarea", { ...p, rows: o || 4 }) : /* @__PURE__ */ g("input", { ...p, type: i === "number" ? "number" : "text" }),
    /* @__PURE__ */ g("div", { className: "fdv2-choice-row", children: /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: !f,
        onClick: h,
        children: n("freeInput.submit")
      }
    ) })
  ] });
}
function kp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = Ce(), i = e.prefill;
  return /* @__PURE__ */ T("div", { className: "fdv2-toggle-control fdv2-choice-row", children: [
    /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: `fdv2-choice-btn ${i === !0 ? "fdv2-choice-confirm" : ""}`,
        disabled: r,
        onClick: () => t(!0),
        children: n("toggle.on")
      }
    ),
    /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: `fdv2-choice-btn ${i === !1 ? "fdv2-choice-confirm" : ""}`,
        disabled: r,
        onClick: () => t(!1),
        children: n("toggle.off")
      }
    )
  ] });
}
function vp({ control: e, onAccept: t, onEdit: n }) {
  const { t: r } = ee(), { loading: i } = Ce(), a = e.fields || [];
  return /* @__PURE__ */ T("div", { className: "fdv2-cascade-control", children: [
    /* @__PURE__ */ g("dl", { className: "fdv2-cascade-list", children: a.map((s) => /* @__PURE__ */ T("div", { className: "fdv2-cascade-row", children: [
      /* @__PURE__ */ g("dt", { children: s.label }),
      /* @__PURE__ */ g("dd", { children: s.display })
    ] }, s.slotId)) }),
    /* @__PURE__ */ T("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", disabled: i, onClick: t, children: r("cascade.accept") }),
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: i, onClick: n, children: r("cascade.edit") })
    ] })
  ] });
}
const wp = ["text", "textarea", "number"], $i = (e) => `${e.label}${e.description ? ` — ${e.description}` : ""}`;
function zt(e, t) {
  return e === "location" ? { code: t.value, name: t.label } : { userId: t.value, name: t.label, ...t.meta && t.meta.email ? { email: t.meta.email } : {} };
}
function gs({ control: e }) {
  const { t } = ee(), { loading: n } = Ce(), r = _e(), [i, a] = ne(null), { id: s, type: o, slotId: u, label: l, defaultValue: c, options: f = [], children: h = [], showChildrenOn: d } = e, p = (b, I, M) => r.sendControlAction({ controlId: s, slotId: u, action: b, value: I }, M), m = d === "_search" && h.some((b) => b.type === "autocomplete"), v = c && typeof c == "object" ? c : null, k = v && (v.name || v.label || [v.firstName, v.lastName].filter(Boolean).join(" ")) || null, S = m && i === "_search", C = S || i != null && i !== "list" && i === d ? h : [], N = (b) => b.type === "autocomplete" ? /* @__PURE__ */ g(
    ji,
    {
      control: { ...b, multi: e.multi === !0, selected: e.selected },
      onPick: (I) => p("submit", zt(b.source?.directory, I), I.label),
      onCommit: (I) => p(
        "submit",
        I.map((M) => zt(b.source?.directory, M)),
        I.map((M) => M.label || M.name).join(", ") || void 0
      )
    },
    b.id
  ) : /* @__PURE__ */ g("div", { className: "fdv2-control-child", children: /* @__PURE__ */ g(gs, { control: b }) }, b.id), A = (b) => {
    if (h.length && d === b.value) {
      a(i === b.value ? null : b.value);
      return;
    }
    p("select", b.value, b.label);
  };
  return /* @__PURE__ */ T("div", { className: "fdv2-control", children: [
    l && o !== "autocomplete" && (o !== "confirm" || !!k) && /* @__PURE__ */ g("div", { className: "fdv2-control-label", children: l }),
    /* @__PURE__ */ T("div", { className: "fdv2-choice-row", children: [
      o === "confirm" && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-confirm",
          disabled: n,
          onClick: () => p("confirm", void 0, k || t("choice.yes")),
          children: k || t("choice.yes")
        }
      ),
      o === "choice" && f.map((b) => /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => A(b), children: $i(b) }, b.value)),
      o === "confirm" && f.length > 0 && /* @__PURE__ */ T("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => a(i === "list" ? null : "list"), children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      o === "confirm" && m && !S && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => a("_search"), children: t("choice.search") }),
      o === "confirm" && S && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-cancel",
          disabled: n,
          title: t("choice.cancel"),
          "aria-label": t("choice.cancel"),
          onClick: () => a(null),
          children: "✕"
        }
      )
    ] }),
    o === "confirm" && i === "list" && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: f.map((b) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ g("button", { type: "button", disabled: n, onClick: () => p("select", b.value, b.label), children: $i(b) }) }, b.value)) }),
    o === "autocomplete" && /* @__PURE__ */ g(
      ji,
      {
        control: e,
        onPick: (b) => p("submit", zt(e.source?.directory, b), b.label),
        onCommit: (b) => p(
          "submit",
          b.map((I) => zt(e.source?.directory, I)),
          b.map((I) => I.label || I.name).join(", ") || void 0
        )
      }
    ),
    o === "date" && /* @__PURE__ */ g(yp, { control: e, onSelect: (b) => p("date_select", b, b) }),
    o === "multichoice" && /* @__PURE__ */ g(
      bp,
      {
        control: e,
        onCommit: (b) => r.sendControlAction({ controlId: s, slotId: u, action: "multichoice_select", values: b }, b.join(", "))
      }
    ),
    wp.includes(o) && /* @__PURE__ */ g(
      xp,
      {
        control: e,
        onCommit: (b) => p(o === "number" ? "number_input" : "text_input", b, String(b))
      }
    ),
    o === "cascade_confirm" && /* @__PURE__ */ g(
      vp,
      {
        control: e,
        onAccept: () => p("cascade_accept", void 0, t("cascade.accept")),
        onEdit: () => p("cascade_edit", void 0, t("cascade.edit"))
      }
    ),
    o === "toggle" && /* @__PURE__ */ g(kp, { control: e, onCommit: (b) => p("toggle_input", b, t(b ? "toggle.on" : "toggle.off")) }),
    C.map(N)
  ] });
}
function Sp({ controls: e }) {
  return !Array.isArray(e) || e.length === 0 ? null : /* @__PURE__ */ g("div", { className: "fdv2-controls", children: e.map((t) => /* @__PURE__ */ g(gs, { control: t }, t.id)) });
}
function Cp(e, t, n) {
  if (t !== "date") return e;
  const r = new Date(e);
  if (Number.isNaN(r.getTime())) return e;
  try {
    return r.toLocaleDateString(n || void 0, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return e;
  }
}
function Ep({ card: e, onOpen: t }) {
  const { i18n: n } = ee(), r = !!(e.revealIntent && t), i = () => {
    r && t(e.revealIntent);
  };
  return /* @__PURE__ */ T(
    "li",
    {
      className: `fdv2-card${r ? " fdv2-card-clickable" : ""}`,
      ...r ? {
        role: "button",
        tabIndex: 0,
        onClick: i,
        onKeyDown: (a) => {
          (a.key === "Enter" || a.key === " ") && (a.preventDefault(), i());
        }
      } : {},
      children: [
        e.accent && /* @__PURE__ */ g("span", { className: "fdv2-card-accent", "data-accent": String(e.accent).toLowerCase(), "aria-hidden": "true" }),
        /* @__PURE__ */ T("div", { className: "fdv2-card-body", children: [
          /* @__PURE__ */ T("div", { className: "fdv2-card-head", children: [
            /* @__PURE__ */ g("span", { className: "fdv2-card-title", children: e.title }),
            e.subtitle && /* @__PURE__ */ g("span", { className: "fdv2-card-sub", children: e.subtitle })
          ] }),
          /* @__PURE__ */ g("dl", { className: "fdv2-card-fields", children: (e.fields || []).map((a) => /* @__PURE__ */ T("div", { className: "fdv2-card-field", children: [
            /* @__PURE__ */ g("dt", { children: a.label }),
            /* @__PURE__ */ g("dd", { children: Cp(a.value, a.format, n.language) })
          ] }, a.label)) })
        ] })
      ]
    }
  );
}
function Np({ cards: e }) {
  if (!Array.isArray(e) || !e.length) return null;
  const t = we().onReveal || null;
  return /* @__PURE__ */ g("ul", { className: "fdv2-cards", children: e.map((n) => /* @__PURE__ */ g(Ep, { card: n, onOpen: t }, `${n.type}-${n.id}`)) });
}
function Ip() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M12 20h9" }),
        /* @__PURE__ */ g("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" })
      ]
    }
  );
}
function Tp({ review: e, interactive: t = !0 }) {
  const { t: n } = ee(), { loading: r } = Ce(), i = _e();
  if (!e || !Array.isArray(e.groups) || e.groups.length === 0) return null;
  const a = (s) => i.sendControlAction({ slotId: s.slotId, action: "edit" }, n("review.editEcho", { field: s.label }));
  return /* @__PURE__ */ g("div", { className: "fdv2-review", role: "table", "aria-label": e.title || n("review.title"), children: e.groups.map((s) => /* @__PURE__ */ T("div", { className: "fdv2-review-group", role: "rowgroup", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-review-section", children: s.label }),
    s.rows.map((o) => /* @__PURE__ */ T("div", { className: "fdv2-review-row", role: "row", children: [
      /* @__PURE__ */ g("span", { className: "fdv2-review-label", role: "cell", children: o.label }),
      /* @__PURE__ */ g("span", { className: "fdv2-review-value", role: "cell", children: String(o.display ?? "") }),
      /* @__PURE__ */ g("span", { className: "fdv2-review-action", role: "cell", children: t && o.editable && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-review-edit",
          disabled: r,
          title: n("review.edit"),
          "aria-label": n("review.editField", { field: o.label }),
          onClick: () => a(o),
          children: /* @__PURE__ */ g(Ip, {})
        }
      ) })
    ] }, o.slotId))
  ] }, s.section)) });
}
function Lp({ open: e, sources: t, onClose: n }) {
  const { t: r } = ee();
  if (te(() => {
    if (!e) return;
    const a = (s) => {
      s.key === "Escape" && n();
    };
    return document.addEventListener("keydown", a), () => document.removeEventListener("keydown", a);
  }, [e, n]), !e) return null;
  const i = Array.isArray(t) ? t : [];
  return /* @__PURE__ */ g("div", { className: "fdv2-sources-overlay", role: "presentation", onClick: n, children: /* @__PURE__ */ T(
    "div",
    {
      className: "fdv2-sources-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": r("sources.title"),
      onClick: (a) => a.stopPropagation(),
      children: [
        /* @__PURE__ */ T("div", { className: "fdv2-sources-head", children: [
          /* @__PURE__ */ g("h3", { className: "fdv2-sources-title", children: r("sources.title") }),
          /* @__PURE__ */ g(
            "button",
            {
              type: "button",
              className: "fdv2-sources-close",
              "aria-label": r("sources.close"),
              onClick: n,
              children: "×"
            }
          )
        ] }),
        /* @__PURE__ */ g("ul", { className: "fdv2-sources-list", children: i.map((a) => /* @__PURE__ */ T("li", { className: "fdv2-source-item", children: [
          /* @__PURE__ */ T("div", { className: "fdv2-source-row", children: [
            /* @__PURE__ */ g("span", { className: "fdv2-source-name", children: a.title }),
            typeof a.relevance == "number" && /* @__PURE__ */ T(
              "span",
              {
                className: "fdv2-source-badge",
                title: r("sources.relevance"),
                children: [
                  Math.round(a.relevance * 100),
                  "%"
                ]
              }
            )
          ] }),
          a.collection && /* @__PURE__ */ T("div", { className: "fdv2-source-collection", children: [
            r("sources.collection"),
            ": ",
            a.collection
          ] }),
          a.snippet && /* @__PURE__ */ g("p", { className: "fdv2-source-snippet", children: a.snippet })
        ] }, a.id)) })
      ]
    }
  ) });
}
function Ap() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M5 12h14" }),
        /* @__PURE__ */ g("path", { d: "M13 6l6 6-6 6" })
      ]
    }
  );
}
function Rp({ navigate: e, onNavigate: t }) {
  const { t: n } = ee();
  return !e || !e.path || typeof t != "function" ? null : /* @__PURE__ */ T(
    "button",
    {
      type: "button",
      className: "fdv2-navigate-link",
      onClick: () => t(e),
      "aria-label": n("navigate.goTo", { path: e.path }),
      children: [
        /* @__PURE__ */ g(Ap, {}),
        n("navigate.goThere")
      ]
    }
  );
}
function Op() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M4 5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" }),
        /* @__PURE__ */ g("path", { d: "M4 19a2 2 0 0 1 2-2h12" })
      ]
    }
  );
}
function Pp() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.9",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M12 19v3" }),
        /* @__PURE__ */ g("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
        /* @__PURE__ */ g("rect", { x: "9", y: "2", width: "6", height: "13", rx: "3" })
      ]
    }
  );
}
function Dp() {
  return /* @__PURE__ */ g(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.9",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ g("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })
    }
  );
}
const _p = { "voice-error": Pp, "chat-error": Dp };
function Fp(e, t, n) {
  if (!e) return { label: "", full: "" };
  const r = new Date(e), i = r.toLocaleString(n), a = Date.now() - r.getTime();
  return a < 6e4 ? { label: t("time.justNow"), full: i } : a < 36e5 ? { label: t("time.minutesAgo", { count: Math.floor(a / 6e4) }), full: i } : { label: r.toLocaleTimeString(n, { hour: "2-digit", minute: "2-digit" }), full: i };
}
function Mp({ message: e, isLast: t, onNavigate: n, userAvatar: r, assistantAvatar: i }) {
  const { t: a, i18n: s } = ee(), { role: o, content: u, timestamp: l, metadata: c } = e, f = Fp(l, a, s.language), h = t && o === "assistant" && Array.isArray(c?.controls) && c.controls.length > 0, d = o === "assistant" && Array.isArray(c?.cards) ? c.cards : null, p = !h && t && o === "assistant" && c?.responseType === "confirm_or_choose" && c?.resolveChoices;
  if (o === "system") {
    const N = _p[c?.kind], A = !!c?.kind;
    return /* @__PURE__ */ T("div", { className: `fdv2-message fdv2-message-system${A ? " fdv2-message-system--with-avatar" : ""}`, children: [
      A && /* @__PURE__ */ g("div", { className: "fdv2-avatar fdv2-avatar-assistant", "aria-hidden": "true", children: i || N && /* @__PURE__ */ g(N, {}) }),
      /* @__PURE__ */ g("span", { className: `fdv2-system-pill${c?.debugDetail ? " fdv2-system-pill--debug" : ""}`, children: /* @__PURE__ */ T("span", { className: "fdv2-system-text-col", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-system-text", children: u }),
        c?.debugDetail && /* @__PURE__ */ T("span", { className: "fdv2-system-debug", children: [
          "[dev] ",
          c.debugDetail
        ] })
      ] }) })
    ] });
  }
  const m = o === "user", v = c?.executionLog, k = Array.isArray(c?.sources) ? c.sources : [], [S, C] = je.useState(!1);
  return /* @__PURE__ */ T("div", { className: `fdv2-message ${m ? "fdv2-message-user" : "fdv2-message-assistant"}`, children: [
    !m && /* @__PURE__ */ g("div", { className: `fdv2-avatar${i ? " fdv2-avatar-assistant" : ""}`, "aria-hidden": "true", children: i || "◆" }),
    /* @__PURE__ */ T("div", { className: "fdv2-bubble-col", children: [
      !(m && r) && /* @__PURE__ */ g("span", { className: "fdv2-sender", children: a(m ? "senderMe" : "agentName") }),
      !m && c?.preamble && /* @__PURE__ */ g("p", { className: "fdv2-preamble", children: c.preamble }),
      /* @__PURE__ */ g("div", { className: "fdv2-bubble", children: m ? /* @__PURE__ */ g("span", { className: "fdv2-user-text", children: u }) : /* @__PURE__ */ g(gp, { children: u }) }),
      !m && c?.review && /* @__PURE__ */ g(Tp, { review: c.review, interactive: t }),
      d && d.length > 0 && /* @__PURE__ */ g(Np, { cards: d }),
      h && /* @__PURE__ */ g(Sp, { controls: c.controls }),
      p && /* @__PURE__ */ g(mp, { resolveChoices: c.resolveChoices }),
      !m && c?.navigate && /* @__PURE__ */ g(Rp, { navigate: c.navigate, onNavigate: n }),
      /* @__PURE__ */ T("div", { className: "fdv2-message-meta", children: [
        /* @__PURE__ */ g("time", { dateTime: l, title: f.full, children: f.label }),
        c?.srNumber && /* @__PURE__ */ g("span", { className: "fdv2-sr-chip", children: c.srNumber }),
        Array.isArray(v) && v.length > 0 && /* @__PURE__ */ T("details", { className: "fdv2-exec-log", children: [
          /* @__PURE__ */ g("summary", { children: a("meta.details", { count: v.length }) }),
          /* @__PURE__ */ g("ol", { children: v.map((N, A) => /* @__PURE__ */ g("li", { className: N.status === "error" ? "err" : "", children: N.node }, A)) })
        ] }),
        !m && k.length > 0 && /* @__PURE__ */ T(
          "button",
          {
            type: "button",
            className: "fdv2-sources-btn",
            title: a("sources.view"),
            "aria-label": a("sources.view"),
            onClick: () => C(!0),
            children: [
              /* @__PURE__ */ g(Op, {}),
              /* @__PURE__ */ g("span", { className: "fdv2-sources-count", children: k.length })
            ]
          }
        )
      ] })
    ] }),
    m && r && /* @__PURE__ */ g("div", { className: "fdv2-avatar fdv2-avatar-user", "aria-hidden": "true", children: r }),
    !m && k.length > 0 && /* @__PURE__ */ g(Lp, { open: S, sources: k, onClose: () => C(!1) })
  ] });
}
function zp({ children: e, emptyState: t, onNavigate: n, userAvatar: r, assistantAvatar: i }) {
  const { t: a } = ee(), s = oa(), o = _e(), u = ae(null), l = ae(null), c = ae(0);
  te(() => {
    const h = u.current;
    if (!h) return;
    const d = s.length > c.current;
    if (c.current = s.length, !d) return;
    const p = h.scrollHeight - h.scrollTop - h.clientHeight < 120, m = s[s.length - 1];
    (p || m?.role === "assistant" || m?.role === "system") && l.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [s]);
  const f = () => {
    window.confirm(a("resetConfirm")) && o.resetSession();
  };
  return /* @__PURE__ */ T("div", { className: "fdv2-messages-wrap", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-messages", ref: u, children: /* @__PURE__ */ T("div", { className: "fdv2-messages-inner", children: [
      s.length === 0 ? (
        // Host-injectable pre-conversation slot; falls back to a bare greeting.
        t != null ? /* @__PURE__ */ g("div", { className: "fdv2-empty fdv2-empty-custom", children: t }) : /* @__PURE__ */ T("div", { className: "fdv2-empty", children: [
          /* @__PURE__ */ g("div", { className: "fdv2-empty-icon", children: "◆" }),
          /* @__PURE__ */ g("h2", { children: a("emptyTitle") })
        ] })
      ) : s.map((h, d) => /* @__PURE__ */ g(Mp, { message: h, isLast: d === s.length - 1, onNavigate: n, userAvatar: r, assistantAvatar: i }, h.id)),
      e,
      /* @__PURE__ */ g("div", { ref: l })
    ] }) }),
    s.length > 0 && /* @__PURE__ */ T(
      "button",
      {
        type: "button",
        className: "fdv2-newchat",
        onClick: f,
        title: a("newChat"),
        "aria-label": a("newChat"),
        children: [
          /* @__PURE__ */ T("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
            /* @__PURE__ */ g("path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
            /* @__PURE__ */ g("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
          ] }),
          /* @__PURE__ */ g("span", { className: "fdv2-newchat-label", children: a("newChat") })
        ]
      }
    )
  ] });
}
const jp = 24e3, $p = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 2400; // ~100ms @ 24kHz
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._target) {
        const frame = this._buf.splice(0, this._target);
        this.port.postMessage(Float32Array.from(frame));
      }
    }
    return true;
  }
}
registerProcessor('fdv2-capture', CaptureProcessor);
`;
function Bp(e) {
  const t = new Int16Array(e.length);
  for (let i = 0; i < e.length; i++) {
    const a = Math.max(-1, Math.min(1, e[i]));
    t[i] = a < 0 ? a * 32768 : a * 32767;
  }
  const n = new Uint8Array(t.buffer);
  let r = "";
  for (let i = 0; i < n.length; i++) r += String.fromCharCode(n[i]);
  return btoa(r);
}
class Vp {
  constructor({ onFrame: t } = {}) {
    this.onFrame = t, this.ctx = null, this.stream = null, this.node = null, this.source = null;
  }
  /** Request the mic and start streaming frames. Throws if permission denied. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }
    });
    const t = window.AudioContext || window.webkitAudioContext;
    this.ctx = new t({ sampleRate: jp }), this.ctx.state === "suspended" && await this.ctx.resume();
    const n = URL.createObjectURL(new Blob([$p], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(n);
    } finally {
      URL.revokeObjectURL(n);
    }
    this.source = this.ctx.createMediaStreamSource(this.stream), this.node = new AudioWorkletNode(this.ctx, "fdv2-capture"), this.node.port.onmessage = (r) => {
      this.onFrame && this.onFrame(Bp(r.data));
    }, this.source.connect(this.node);
  }
  async stop() {
    try {
      this.node && (this.node.port.onmessage = null);
    } catch {
    }
    try {
      this.source && this.source.disconnect();
    } catch {
    }
    try {
      this.node && this.node.disconnect();
    } catch {
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const Bi = 24e3;
function Hp(e) {
  const t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = t.charCodeAt(i);
  return new Int16Array(r.buffer, 0, n >> 1);
}
function Up(e) {
  const t = new Float32Array(e.length);
  for (let n = 0; n < e.length; n++) t[n] = Math.max(-1, e[n] / 32768);
  return t;
}
class qp {
  constructor({ onStarted: t, onEnded: n } = {}) {
    this.ctx = null, this.nextStartTime = 0, this.activeSources = /* @__PURE__ */ new Set(), this.playing = !1, this.onStarted = t, this.onEnded = n, this._endTimer = null, this.analyser = null, this._freq = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      const t = window.AudioContext || window.webkitAudioContext;
      this.ctx = new t({ sampleRate: Bi });
    }
    if (!this.analyser)
      try {
        this.analyser = this.ctx.createAnalyser(), this.analyser.fftSize = 256, this.analyser.smoothingTimeConstant = 0.8, this.analyser.connect(this.ctx.destination), this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      } catch {
        this.analyser = null;
      }
    return this.ctx.state === "suspended" && this.ctx.resume(), this.ctx;
  }
  /**
   * Current output amplitude in [0,1] for the pulsing orb (Phase 6). Mean of the
   * frequency magnitudes, normalized; 0 when idle or when no analyser is available.
   */
  getLevel() {
    if (!this.playing || !this.analyser || !this._freq) return 0;
    this.analyser.getByteFrequencyData(this._freq);
    let t = 0;
    for (let n = 0; n < this._freq.length; n++) t += this._freq[n];
    return t / this._freq.length / 255;
  }
  /**
   * Create + resume the output AudioContext eagerly. MUST be called from within a
   * user gesture (the Live Chat click) — browsers keep an AudioContext suspended
   * if it is first touched outside a gesture, which silences the agent's TTS even
   * though audio frames arrive. Called at session start so playback is unlocked
   * before the first `audio` frame (which arrives outside any gesture).
   */
  unlock() {
    const t = this._ensureCtx();
    return t && t.state === "running" && (this.nextStartTime = Math.max(this.nextStartTime, t.currentTime)), t && t.state;
  }
  /** Enqueue one base64 PCM16 delta for gapless playback. */
  enqueue(t) {
    const n = this._ensureCtx(), r = Up(Hp(t));
    if (r.length === 0) return;
    const i = n.createBuffer(1, r.length, Bi);
    i.getChannelData(0).set(r);
    const a = n.createBufferSource();
    a.buffer = i, a.connect(this.analyser || n.destination);
    const s = n.currentTime, o = Math.max(s, this.nextStartTime);
    this.playing || (this.playing = !0, this.onStarted && this.onStarted()), a.start(o), this.nextStartTime = o + i.duration, this.activeSources.add(a), a.onended = () => {
      this.activeSources.delete(a), this._endTimer && clearTimeout(this._endTimer), this._endTimer = setTimeout(() => {
        this.activeSources.size === 0 && this.playing && (this.playing = !1, this.onEnded && this.onEnded());
      }, 60);
    };
  }
  /** Barge-in / cancel: stop everything currently scheduled. */
  clear() {
    for (const t of this.activeSources)
      try {
        t.onended = null, t.stop();
      } catch {
      }
    this.activeSources.clear(), this.nextStartTime = this.ctx ? this.ctx.currentTime : 0, this.playing && (this.playing = !1, this.onEnded && this.onEnded());
  }
  async close() {
    if (this.clear(), this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const Y = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  ERROR: "error"
}, Rn = {
  listening: Y.LISTENING,
  processing: Y.PROCESSING,
  speaking: Y.SPEAKING
}, Kp = 15e3;
class Wp {
  constructor({ sessionId: t, userId: n, lang: r, voice: i, onState: a, onTranscript: s, onChoices: o, onError: u } = {}) {
    this.sessionId = t, this.userId = n || we().userId, this.lang = r || null, this.voice = i || null, this.onState = a || (() => {
    }), this.onTranscript = s || (() => {
    }), this.onChoices = o || (() => {
    }), this.onError = u || (() => {
    }), this.ws = null, this.capture = null, this.playback = null, this.state = Y.IDLE, this._closed = !1, this._idleTimer = null;
  }
  _setState(t) {
    this.state = t, this.onState(t);
  }
  // V2 idle auto-disable: armed only once the agent's audio has fully drained and
  // we are listening; any activity clears it; on timeout the session ends.
  _armIdle() {
    this._clearIdle(), this._idleTimer = setTimeout(() => {
      this._idleTimer = null, this._closed || this.stop();
    }, Kp);
  }
  _clearIdle() {
    this._idleTimer && (clearTimeout(this._idleTimer), this._idleTimer = null);
  }
  _maybeArmIdleAfterSpeech() {
    this.state === Y.LISTENING && (!this.playback || !this.playback.playing) && this._armIdle();
  }
  /** Phase 6: current TTS output amplitude [0,1] for the pulsing orb. */
  getLevel() {
    return this.playback ? this.playback.getLevel() : 0;
  }
  async start() {
    this._setState(Y.CONNECTING), this._ensurePlayback();
    try {
      this.playback.unlock();
    } catch {
    }
    try {
      const t = await this._fetchToken(), n = await Le(), r = this._buildWsUrl(t, n);
      await this._openWs(r, t);
    } catch (t) {
      this._fail(t);
    }
  }
  async _fetchToken() {
    const t = await Le({ "Content-Type": "application/json" }), n = await De()(Zn("/flowdesk/voice/token"), {
      method: "POST",
      headers: t,
      credentials: "include",
      body: JSON.stringify({ sessionId: this.sessionId, userId: this.userId })
    });
    if (!n.ok) throw new Error(`voice token failed (HTTP ${n.status})`);
    const r = await n.json();
    if (r.wsUrl) throw new Error("unexpected direct wsUrl from token endpoint (key-leak guard)");
    if (!r.useProxy || !r.ticket) throw new Error("voice token missing proxy fields");
    return r;
  }
  _buildWsUrl(t, n = {}) {
    const r = new URL(we().apiBaseUrl, window.location.origin), i = r.protocol === "https:" ? "wss:" : "ws:", a = r.pathname.replace(/\/+$/, ""), s = t.proxySuffix || "/flowdesk/voice/proxy", o = new URLSearchParams();
    o.set("sessionId", this.sessionId), o.set("ticket", t.ticket), this.lang && o.set("lang", this.lang), this.voice && o.set("voice", this.voice);
    const u = (f, ...h) => {
      for (const d of h)
        if (f && f[d]) return f[d];
      return null;
    }, l = u(n, "API-Key", "Api-Key", "api-key", "apikey");
    l && o.set("api_key", l);
    const c = u(n, "Authorization", "authorization");
    return c && /^Bearer\s+/i.test(c) && o.set("access_token", c.replace(/^Bearer\s+/i, "")), `${i}//${r.host}${a}${s}?${o.toString()}`;
  }
  _openWs(t, n) {
    return new Promise((r, i) => {
      const a = new WebSocket(t, [n.subprotocol || "realtime"]);
      this.ws = a;
      let s = !1;
      a.onopen = async () => {
        s || (s = !0, r());
        try {
          await this._startCapture(), this._setState(Y.LISTENING);
        } catch (o) {
          this._fail(o);
        }
      }, a.onmessage = (o) => {
        let u;
        try {
          u = JSON.parse(o.data);
        } catch {
          return;
        }
        this._onServerEvent(u);
      }, a.onerror = () => {
        s || (s = !0, i(new Error("voice relay connection error")));
      }, a.onclose = () => {
        this._closed || this._teardown();
      };
    });
  }
  _onServerEvent(t) {
    switch (t.type) {
      case "state":
        Rn[t.status] && (this._setState(Rn[t.status]), Rn[t.status] === Y.LISTENING ? this._maybeArmIdleAfterSpeech() : this._clearIdle());
        break;
      case "barge_in":
        this._clearIdle(), this.playback && this.playback.clear();
        break;
      case "transcript":
        this._clearIdle(), t.text && this.onTranscript(t.role || "assistant", t.text, { language: t.lang, meta: t.meta || null });
        break;
      case "choices":
        this.onChoices(t.items || []);
        break;
      case "audio":
        t.data && (this._clearIdle(), this._ensurePlayback(), this.playback.enqueue(t.data));
        break;
      case "audioDone":
        break;
      case "error":
        this.onError(new Error(t.message || "voice error"));
        break;
    }
  }
  _ensurePlayback() {
    this.playback || (this.playback = new qp({ onEnded: () => this._maybeArmIdleAfterSpeech() }));
  }
  async _startCapture() {
    this.capture = new Vp({
      onFrame: (t) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "audio", data: t }));
      }
    }), await this.capture.start();
  }
  _fail(t) {
    this._setState(Y.ERROR), this.onError(t instanceof Error ? t : new Error(String(t))), this._teardown();
  }
  async _teardown() {
    if (!this._closed) {
      this._closed = !0, this._clearIdle();
      try {
        this.capture && await this.capture.stop();
      } catch {
      }
      try {
        this.playback && await this.playback.close();
      } catch {
      }
      try {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "stop" }));
      } catch {
      }
      try {
        this.ws && this.ws.close();
      } catch {
      }
    }
  }
  async stop() {
    await this._teardown(), this.state !== Y.ERROR && this._setState(Y.IDLE);
  }
  /** V2: request a zero-query anchor explanation over the open WS ("Get help"). */
  sendExplain(t) {
    this.ws && this.ws.readyState === WebSocket.OPEN && t && t.id && this.ws.send(JSON.stringify({ type: "explain", anchor: { id: t.id, title: t.title } }));
  }
}
function Gp({ userId: e, lang: t, voice: n } = {}) {
  const [r, i] = ne(Y.IDLE), [a, s] = ne(null), [o, u] = ne(0), l = ae(null), c = ae(null), f = _e(), h = aa((k) => k.session.id);
  te(() => {
    if (!(r !== Y.IDLE && r !== Y.ERROR)) {
      u(0);
      return;
    }
    let S = !0;
    const C = () => {
      S && (u(l.current ? l.current.getLevel() : 0), c.current = requestAnimationFrame(C));
    };
    return c.current = requestAnimationFrame(C), () => {
      S = !1, c.current && cancelAnimationFrame(c.current);
    };
  }, [r]);
  const d = Se(async () => {
    const k = l.current;
    l.current = null, k && await k.stop(), i(Y.IDLE);
  }, []), p = Se(async () => {
    if (l.current) return;
    s(null);
    const k = new Wp({
      sessionId: h,
      userId: e || we().userId,
      lang: t,
      voice: n,
      onState: i,
      onTranscript: (S, C, N) => {
        const A = { source: "voice" };
        S === "assistant" && N && N.meta && Object.assign(A, N.meta), f.addMessage(S, C, A);
      },
      onError: (S) => {
        s(S), i(Y.ERROR), console.error("[flowdesk-chat-v2] voice session failed:", S);
        const C = "I couldn't connect to the voice assistant. Please try again in a moment.", N = we().debug ? S.message : null;
        f.addMessage("system", C, { kind: "voice-error", debugDetail: N }), l.current = null;
      }
    });
    l.current = k, await k.start();
  }, [h, e, t, n, f]), m = Se(() => l.current ? d() : p(), [p, d]);
  te(() => () => {
    l.current && l.current.stop();
  }, []);
  const v = r !== Y.IDLE && r !== Y.ERROR;
  return { state: r, error: a, level: o, isActive: v, start: p, stop: d, toggle: m };
}
function Jp({ state: e = "idle", amplitude: t = 0, size: n = 72, label: r, className: i = "" }) {
  const a = Math.max(0, Math.min(1, Number(t) || 0)), o = e === "speaking" || e === "listening" ? 1 + a * 0.35 : 1;
  return /* @__PURE__ */ g(
    "div",
    {
      className: `fdv2-voice-orb fdv2-voice-orb--${e}${i ? ` ${i}` : ""}`,
      style: { "--orb-size": `${n}px`, "--orb-scale": o },
      role: "status",
      "aria-label": r || e,
      children: /* @__PURE__ */ g("span", { className: "fdv2-voice-orb-core" })
    }
  );
}
const Vi = {
  en: [
    { id: "en-US-AvaMultilingualNeural", label: "Ava", default: !0 },
    { id: "en-US-JennyNeural", label: "Jenny (US)" },
    { id: "en-US-GuyNeural", label: "Guy (US)" },
    { id: "en-GB-SoniaNeural", label: "Sonia (UK)" }
  ],
  ru: [
    { id: "ru-RU-SvetlanaNeural", label: "Светлана", default: !0 },
    { id: "ru-RU-DmitryNeural", label: "Дмитрий" }
  ],
  fr: [
    { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne", default: !0 },
    { id: "fr-FR-DeniseNeural", label: "Denise" },
    { id: "fr-FR-HenriNeural", label: "Henri" }
  ],
  es: [
    { id: "es-ES-ElviraNeural", label: "Elvira", default: !0 },
    { id: "es-ES-AlvaroNeural", label: "Álvaro" }
  ],
  ar: [
    { id: "ar-SA-HamedNeural", label: "حامد", default: !0 },
    { id: "ar-SA-ZariyahNeural", label: "زارية" }
  ],
  zh: [
    { id: "zh-CN-XiaoxiaoMultilingualNeural", label: "晓晓", default: !0 },
    { id: "zh-CN-YunxiNeural", label: "云希" }
  ]
}, Yp = (e) => String(e || "en").split("-")[0];
function xr(e) {
  return Vi[Yp(e)] || Vi.en;
}
function Qp(e) {
  const t = xr(e), n = t.find((r) => r.default) || t[0];
  return n ? n.id : null;
}
function Xp(e, t) {
  return !!e && xr(t).some((n) => n.id === e);
}
function ms(e, t) {
  const n = t || e && e.language || "en", r = e && e.voice;
  return Xp(r, n) ? r : Qp(n);
}
const Zp = {
  [Y.CONNECTING]: "thinking",
  [Y.LISTENING]: "listening",
  [Y.PROCESSING]: "thinking",
  [Y.SPEAKING]: "speaking"
};
function eg({ userId: e, onActiveChange: t }) {
  const { t: n } = ee(), [r] = er(), { state: i, level: a, isActive: s, toggle: o } = Gp({ userId: e, lang: r.language, voice: ms(r, r.language) });
  te(() => {
    t?.(s);
  }, [s, t]);
  const u = n("liveChat"), l = i === Y.CONNECTING, c = {
    [Y.IDLE]: u,
    [Y.CONNECTING]: n("liveChatConnecting", "Connecting…"),
    [Y.LISTENING]: n("liveChatListening", "Listening…"),
    [Y.PROCESSING]: n("liveChatProcessing", "Thinking…"),
    [Y.SPEAKING]: n("liveChatSpeaking", "Speaking…"),
    [Y.ERROR]: u
  }[i] || u, f = i === Y.SPEAKING, h = /* @__PURE__ */ g(
    "button",
    {
      type: "button",
      className: `fdv2-livechat-fab${s ? " is-active" : ""}`,
      "data-voice-state": i,
      style: f ? { "--fdv2-level": a || 0 } : void 0,
      onClick: o,
      "aria-pressed": s,
      title: c,
      "aria-label": c,
      children: l ? (
        // spinner
        /* @__PURE__ */ g("svg", { className: "fdv2-spin", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ g("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) })
      ) : s ? (
        // active → tap to stop voice and go back to typing (crossed-out mic)
        /* @__PURE__ */ T("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
          /* @__PURE__ */ g("path", { d: "M12 19v3" }),
          /* @__PURE__ */ g("path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }),
          /* @__PURE__ */ g("path", { d: "M16.95 16.95A7 7 0 0 1 5 12v-2" }),
          /* @__PURE__ */ g("path", { d: "M18.89 13.23A7 7 0 0 0 19 12v-2" }),
          /* @__PURE__ */ g("path", { d: "m2 2 20 20" }),
          /* @__PURE__ */ g("path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" })
        ] })
      ) : (
        // idle → tap to start voice (mic)
        /* @__PURE__ */ T("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
          /* @__PURE__ */ g("path", { d: "M12 19v3" }),
          /* @__PURE__ */ g("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
          /* @__PURE__ */ g("rect", { x: "9", y: "2", width: "6", height: "13", rx: "3" })
        ] })
      )
    }
  ), d = s ? /* @__PURE__ */ g("div", { className: "fdv2-voice-overlay", role: "presentation", onClick: o, children: /* @__PURE__ */ T("div", { className: "fdv2-voice-stage", onClick: (p) => p.stopPropagation(), children: [
    /* @__PURE__ */ g(Jp, { state: Zp[i] || "idle", amplitude: a, size: 14, label: c }),
    /* @__PURE__ */ g("div", { className: "fdv2-voice-status", children: c }),
    /* @__PURE__ */ g("button", { type: "button", className: "fdv2-voice-end", onClick: o, children: n("liveChatEnd", "End") })
  ] }) }) : null;
  return /* @__PURE__ */ T(Jt, { children: [
    h,
    d
  ] });
}
function tg() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("line", { x1: "4", y1: "21", x2: "4", y2: "14" }),
        /* @__PURE__ */ g("line", { x1: "4", y1: "10", x2: "4", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "12", y1: "21", x2: "12", y2: "12" }),
        /* @__PURE__ */ g("line", { x1: "12", y1: "8", x2: "12", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "20", y1: "21", x2: "20", y2: "16" }),
        /* @__PURE__ */ g("line", { x1: "20", y1: "12", x2: "20", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "1", y1: "14", x2: "7", y2: "14" }),
        /* @__PURE__ */ g("line", { x1: "9", y1: "8", x2: "15", y2: "8" }),
        /* @__PURE__ */ g("line", { x1: "17", y1: "16", x2: "23", y2: "16" })
      ]
    }
  );
}
function ng() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("circle", { cx: "12", cy: "12", r: "10" }),
        /* @__PURE__ */ g("line", { x1: "2", y1: "12", x2: "22", y2: "12" }),
        /* @__PURE__ */ g("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })
      ]
    }
  );
}
function rg() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
        /* @__PURE__ */ g("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
        /* @__PURE__ */ g("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })
      ]
    }
  );
}
function Hi() {
  return /* @__PURE__ */ g(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ g("polyline", { points: "6 9 12 15 18 9" })
    }
  );
}
function ig({ open: e, onClose: t }) {
  const { t: n } = ee(), [r, i] = er(), a = xr(r.language), s = ms(r, r.language);
  return te(() => {
    if (!e) return;
    const o = (u) => {
      u.key === "Escape" && t && t();
    };
    return document.addEventListener("keydown", o), () => document.removeEventListener("keydown", o);
  }, [e, t]), e ? qi(
    /* @__PURE__ */ g("div", { className: "fdv2-settings-overlay", role: "presentation", onClick: t, children: /* @__PURE__ */ T(
      "div",
      {
        className: "fdv2-settings-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "fdv2-settings-title",
        onClick: (o) => o.stopPropagation(),
        children: [
          /* @__PURE__ */ T("header", { className: "fdv2-settings-header", children: [
            /* @__PURE__ */ T("span", { className: "fdv2-settings-header-title", children: [
              /* @__PURE__ */ g("span", { className: "fdv2-settings-icon", "aria-hidden": "true", children: /* @__PURE__ */ g(tg, {}) }),
              /* @__PURE__ */ g("span", { id: "fdv2-settings-title", className: "fdv2-settings-title", children: n("settings.title", "AI Settings") })
            ] }),
            /* @__PURE__ */ g("button", { type: "button", className: "fdv2-settings-close", onClick: t, "aria-label": n("settings.close", "Close"), children: "×" })
          ] }),
          /* @__PURE__ */ T("div", { className: "fdv2-settings-body", children: [
            /* @__PURE__ */ T("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ T("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-language", children: [
                /* @__PURE__ */ g(ng, {}),
                " ",
                n("settings.language", "Language")
              ] }),
              /* @__PURE__ */ T("div", { className: "fdv2-select-wrap", children: [
                /* @__PURE__ */ g(
                  "select",
                  {
                    id: "fdv2-setting-language",
                    className: "fdv2-setting-select",
                    value: r.language,
                    onChange: (o) => i({ language: o.target.value, voice: null }),
                    children: Qn.map((o) => /* @__PURE__ */ g("option", { value: o.code, children: o.label }, o.code))
                  }
                ),
                /* @__PURE__ */ g("span", { className: "fdv2-select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ g(Hi, {}) })
              ] }),
              /* @__PURE__ */ g("p", { className: "fdv2-setting-hint", children: n("settings.languageHint", "Used for AI responses and for voice/text recognition. Auto-detection is off.") })
            ] }),
            /* @__PURE__ */ T("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ T("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-voice", children: [
                /* @__PURE__ */ g(rg, {}),
                " ",
                n("settings.voice", "Assistant voice")
              ] }),
              /* @__PURE__ */ T("div", { className: "fdv2-select-wrap", children: [
                /* @__PURE__ */ g(
                  "select",
                  {
                    id: "fdv2-setting-voice",
                    className: "fdv2-setting-select",
                    value: s || "",
                    onChange: (o) => i({ voice: o.target.value }),
                    children: a.map((o) => /* @__PURE__ */ T("option", { value: o.id, children: [
                      o.label,
                      o.default ? ` · ${n("settings.voiceDefault", "Default")}` : ""
                    ] }, o.id))
                  }
                ),
                /* @__PURE__ */ g("span", { className: "fdv2-select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ g(Hi, {}) })
              ] }),
              /* @__PURE__ */ g("p", { className: "fdv2-setting-hint", children: n("settings.voiceHint", "Voice used for the AI assistant’s spoken replies.") })
            ] })
          ] })
        ]
      }
    ) }),
    document.body
  ) : null;
}
const ag = 8;
function sg({
  userId: e,
  showVoiceControls: t = !0,
  showSettings: n = !0,
  onVoiceActiveChange: r,
  showAttachments: i = !0
}) {
  const { t: a } = ee(), { loading: s, composerDisabled: o, uploading: u } = Ce(), l = _e(), [c, f] = ne(""), [h, d] = ne(!1), p = ae(null), m = ae(null), v = ae(null), k = Se(async (I) => {
    const M = I.target.files && I.target.files[0];
    I.target.value = "", M && await l.uploadAttachment(M);
  }, [l]), S = Se(() => {
    const I = p.current;
    if (!I) return;
    I.style.height = "auto";
    const F = (parseFloat(getComputedStyle(I).lineHeight) || 20) * ag;
    I.style.height = `${Math.min(I.scrollHeight, F)}px`, I.style.overflowY = I.scrollHeight > F ? "auto" : "hidden";
  }, []);
  te(() => {
    S();
  }, [c, S]), te(() => {
    !s && !o && p.current?.focus();
  }, [s, o]);
  const C = c.trim().length > 0 && !s && !o, N = Se(async () => {
    const I = c.trim();
    if (!I || s || o) return;
    f("");
    const M = new AbortController();
    m.current = M;
    try {
      await l.sendMessage(I, e, M.signal);
    } finally {
      m.current = null, p.current?.focus();
    }
  }, [c, s, o, l, e]), A = Se(() => {
    m.current?.abort();
  }, []), b = (I) => {
    I.key === "Enter" && !I.shiftKey && (I.preventDefault(), N());
  };
  return /* @__PURE__ */ T("div", { className: "fdv2-composer-wrap", children: [
    /* @__PURE__ */ T("div", { className: `fdv2-composer ${o ? "is-disabled" : ""}`, children: [
      i && /* @__PURE__ */ T(Jt, { children: [
        /* @__PURE__ */ g(
          "input",
          {
            ref: v,
            type: "file",
            className: "fdv2-file-input",
            onChange: k,
            accept: ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
          }
        ),
        /* @__PURE__ */ g(
          "button",
          {
            type: "button",
            className: "fdv2-icon-btn fdv2-attach",
            onClick: () => v.current?.click(),
            disabled: u || o,
            title: a("upload.attach"),
            "aria-label": a("upload.attach"),
            "aria-busy": u || void 0,
            children: u ? /* @__PURE__ */ g("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", className: "fdv2-spin", "aria-hidden": "true", children: /* @__PURE__ */ g("path", { d: "M21 12a9 9 0 1 1-6.2-8.6", strokeLinecap: "round" }) }) : /* @__PURE__ */ g("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ g("path", { d: "M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 1 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 1 1-2.59-2.6l8.49-8.48" }) })
          }
        )
      ] }),
      /* @__PURE__ */ g(
        "textarea",
        {
          ref: p,
          className: "fdv2-textarea",
          rows: 1,
          value: c,
          onChange: (I) => f(I.target.value),
          onKeyDown: b,
          onFocus: () => l.seedGreeting(),
          placeholder: a(o ? "composerDisabled" : "composerPlaceholder"),
          disabled: o,
          "aria-label": a("composerPlaceholder")
        }
      ),
      s ? /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-stop", onClick: A, title: a("stop"), "aria-label": a("stop"), children: /* @__PURE__ */ g("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ g("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }) }) : /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-send", onClick: N, disabled: !C, title: a("send"), "aria-label": a("send"), children: /* @__PURE__ */ T("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
        /* @__PURE__ */ g("path", { d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" }),
        /* @__PURE__ */ g("path", { d: "m21.854 2.147-10.94 10.939" })
      ] }) }),
      (n || t) && /* @__PURE__ */ T("div", { className: "fdv2-composer-tools", children: [
        t && /* @__PURE__ */ g(eg, { userId: e, onActiveChange: r }),
        n && /* @__PURE__ */ g(
          "button",
          {
            type: "button",
            className: "fdv2-icon-btn fdv2-settings-btn",
            onClick: () => d(!0),
            title: a("settings.open", "AI Settings"),
            "aria-label": a("settings.open", "AI Settings"),
            "aria-haspopup": "dialog",
            children: /* @__PURE__ */ T("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
              /* @__PURE__ */ g("circle", { cx: "12", cy: "12", r: "3" }),
              /* @__PURE__ */ g("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ g("div", { className: "fdv2-composer-hint", children: a("composerHint") }),
    /* @__PURE__ */ g(ig, { open: h, onClose: () => d(!1) })
  ] });
}
function og() {
  const { t: e } = ee(), { loading: t, currentNode: n } = Ce();
  if (!t) return null;
  const r = n && e(`node.${n}`, { defaultValue: "" }) || e("thinking");
  return /* @__PURE__ */ T("div", { className: "fdv2-message fdv2-message-assistant fdv2-typing", "aria-live": "polite", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ g("div", { className: "fdv2-bubble-col", children: /* @__PURE__ */ T("div", { className: "fdv2-typing-row", children: [
      /* @__PURE__ */ T("span", { className: "fdv2-typing-dots", "aria-hidden": "true", children: [
        /* @__PURE__ */ g("i", {}),
        /* @__PURE__ */ g("i", {}),
        /* @__PURE__ */ g("i", {})
      ] }),
      /* @__PURE__ */ g("span", { className: "fdv2-typing-text", children: r })
    ] }) })
  ] });
}
const lg = {
  extracted: "🤖",
  user_edited: "✏️",
  context: "📍",
  resolved: "⚙️"
};
function ys(e, t, n, r = /* @__PURE__ */ new Set()) {
  return r.has(e) ? !1 : (r.add(e), t?.[e]?.stale ? !0 : ((n?.slots || []).find((o) => o.slotId === e)?.dependsOn || []).some((o) => ys(o, t, n, r)));
}
function ug(e) {
  return (e?.phases || []).map((r) => ({
    phase: r,
    slots: (e?.slots || []).filter((i) => i.phase === r)
  })).filter((r) => r.slots.length > 0);
}
function cg(e) {
  return e == null || e === "" ? null : typeof e == "object" ? e.name || e.city || e.id || e.mode || JSON.stringify(e) : String(e);
}
function fg({ slotDef: e, slotValue: t, affectedStale: n, onEdit: r }) {
  const { t: i } = ee(), [a, s] = ne(!1), [o, u] = ne(""), l = ae(null), c = cg(t?.value), f = t?.provenance || null, h = f ? lg[f] : null, d = f ? i(`provenance.${f}`, { defaultValue: f }) : "", p = e.type === "enum", v = !(t && typeof t.value == "object");
  te(() => {
    a && l.current?.focus();
  }, [a]);
  const k = () => {
    v && (u(p ? t?.value ?? "" : c ?? ""), s(!0));
  }, S = () => {
    s(!1);
    const N = o;
    N !== "" && N !== (t?.value ?? "") && r(e.slotId, N);
  }, C = (N) => {
    N.key === "Enter" && (N.preventDefault(), S()), N.key === "Escape" && s(!1);
  };
  return /* @__PURE__ */ T("div", { className: `fdv2-slot ${n ? "is-stale" : ""}`, children: [
    /* @__PURE__ */ T("div", { className: "fdv2-slot-label", children: [
      (e.promptHint, e.slotId),
      e.required && /* @__PURE__ */ g("span", { className: "fdv2-slot-req", title: i("slot.required"), children: "*" })
    ] }),
    /* @__PURE__ */ T("div", { className: "fdv2-slot-value", children: [
      a ? p ? /* @__PURE__ */ T("select", { ref: l, value: o, onChange: (N) => u(N.target.value), onBlur: S, onKeyDown: C, className: "fdv2-slot-input", children: [
        /* @__PURE__ */ g("option", { value: "", disabled: !0, children: "—" }),
        (e.presentOptions || []).map((N) => /* @__PURE__ */ g("option", { value: N.value, children: N.label }, N.value))
      ] }) : /* @__PURE__ */ g("input", { ref: l, value: o, onChange: (N) => u(N.target.value), onBlur: S, onKeyDown: C, className: "fdv2-slot-input" }) : /* @__PURE__ */ g("button", { type: "button", className: `fdv2-slot-val-btn ${c ? "" : "is-empty"} ${v ? "" : "is-readonly"}`, onClick: k, title: v ? i("slot.edit") : "", children: c || "—" }),
      h && /* @__PURE__ */ g("span", { className: "fdv2-slot-prov", title: d, "aria-label": d, children: h }),
      n && /* @__PURE__ */ g("span", { className: "fdv2-slot-stale", title: i("slot.stale"), children: "⚠️" })
    ] })
  ] });
}
function dg() {
  const { t: e } = ee(), t = $o(), n = Bo(), r = la(), { draftPanelOpen: i } = Ce(), a = _e(), s = !!r.serviceId;
  if (!i)
    return /* @__PURE__ */ g("div", { className: "fdv2-draft-collapsed", children: /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn", onClick: a.toggleDraftPanel, title: e("draft.expand"), "aria-label": e("draft.expand"), children: "▸" }) });
  const o = n?.metadata?.title || r.serviceId || e("draft.title"), u = e(`status.${r.status || "draft"}`, { defaultValue: r.status || "" }), l = n ? ug(n) : [], c = t.beneficiary;
  return /* @__PURE__ */ T("div", { className: "fdv2-draft-panel", children: [
    /* @__PURE__ */ T("div", { className: "fdv2-draft-head", children: [
      /* @__PURE__ */ g("div", { className: "fdv2-draft-title", children: o }),
      /* @__PURE__ */ T("div", { className: "fdv2-draft-headright", children: [
        /* @__PURE__ */ g("span", { className: `fdv2-status-badge fdv2-status-${r.status || "draft"}`, children: u }),
        /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-draft-collapse", onClick: a.toggleDraftPanel, title: e("draft.collapse"), "aria-label": e("draft.collapse"), children: "▾" })
      ] })
    ] }),
    s ? /* @__PURE__ */ T("div", { className: "fdv2-draft-body", children: [
      c && /* @__PURE__ */ T("div", { className: "fdv2-draft-benef", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-benef-label", children: e("draft.beneficiary") }),
        /* @__PURE__ */ g("span", { className: "fdv2-benef-val", children: c.mode === "self" ? e("draft.forSelf") : c.resolvedProfile?.name || c.userId || "—" })
      ] }),
      l.length === 0 && /* @__PURE__ */ g("div", { className: "fdv2-draft-empty", children: /* @__PURE__ */ g("p", { children: e("draft.loading") }) }),
      l.map((f) => /* @__PURE__ */ T("section", { className: "fdv2-draft-group", children: [
        /* @__PURE__ */ g("h4", { className: "fdv2-draft-group-title", children: e(`phase.${f.phase}`, { defaultValue: f.phase }) }),
        f.slots.map((h) => /* @__PURE__ */ g(
          fg,
          {
            slotDef: h,
            slotValue: t.slots[h.slotId],
            affectedStale: ys(h.slotId, t.slots, n),
            onEdit: a.patchSlot
          },
          h.slotId
        ))
      ] }, f.phase))
    ] }) : /* @__PURE__ */ T("div", { className: "fdv2-draft-empty", children: [
      /* @__PURE__ */ g("p", { children: e("draft.empty") }),
      /* @__PURE__ */ g("p", { className: "fdv2-draft-empty-hint", children: e("draft.emptyHint") })
    ] })
  ] });
}
function hg({
  showDraftPanel: e,
  showLanguageSwitcher: t,
  showVoiceControls: n,
  showAttachments: r,
  className: i,
  serviceId: a,
  sessionId: s = null,
  emptyState: o,
  userProfile: u,
  userAvatar: l,
  assistantAvatar: c,
  anchorContext: f = null,
  compact: h = !1,
  onNavigate: d,
  onVoiceActiveChange: p
}) {
  const { t: m } = ee(), v = _e(), k = la(), S = Ye(), [C, N] = ne(Vr()), A = ae(!1);
  te(() => {
    A.current || !s || (A.current = !0, v.adoptSession(s), v.loadVoiceHistory && v.loadVoiceHistory());
  }, [s, v]), te(() => {
    const M = () => N(Vr());
    return ue.on("languageChanged", M), () => ue.off("languageChanged", M);
  }, []);
  const b = ae(!1);
  te(() => {
    v.setAnchorContext && v.setAnchorContext(f || null), f && f.anchorId && !b.current && (b.current = !0, v.sendAnchorExplain(f));
  }, [f, v]), te(() => {
    u && u.userId && v.setUser(u);
  }, [u, v]);
  const I = ae(!1);
  return te(() => {
    I.current || !a || (I.current = !0, k.serviceId !== a && (S.getState().messages.length > 0 || v.startSession(a)));
  }, [a, k.serviceId, v]), /* @__PURE__ */ g(
    "div",
    {
      className: `fdv2-root${h ? " fdv2-compact" : ""}${i ? ` ${i}` : ""}`,
      "data-feature": "altiora-chat",
      dir: C,
      children: /* @__PURE__ */ T("main", { className: "fdv2-main", children: [
        /* @__PURE__ */ T("section", { className: "fdv2-conversation", "aria-label": "Conversation", children: [
          /* @__PURE__ */ g(zp, { emptyState: o, onNavigate: d, userAvatar: l, assistantAvatar: c, children: /* @__PURE__ */ g(og, {}) }),
          /* @__PURE__ */ g(sg, { showVoiceControls: n, showAttachments: r, showSettings: t, onVoiceActiveChange: p })
        ] }),
        e && /* @__PURE__ */ g("aside", { className: "fdv2-draft", "aria-label": m("draft.requestLabel"), children: /* @__PURE__ */ g(dg, {}) })
      ] })
    }
  );
}
function pg({
  apiBaseUrl: e,
  userId: t,
  userProfile: n,
  userAvatar: r,
  assistantAvatar: i,
  getAuthHeaders: a,
  fetchImpl: s,
  eventSourceImpl: o,
  lang: u,
  serviceId: l = null,
  showDraftPanel: c = !1,
  showLanguageSwitcher: f = !0,
  showVoiceControls: h = !0,
  showAttachments: d = !0,
  className: p,
  emptyState: m,
  children: v,
  onSubmitted: k,
  onError: S,
  onSessionStart: C,
  anchorContext: N = null,
  compact: A = !1,
  // eslint-disable-next-line no-unused-vars -- Phase 3: host close handler, consumed by the floating window wrapper
  onClose: b,
  onNavigate: I,
  onOpenForm: M,
  // REQ-005: the host opens its own detail dialog when a row in the chat is clicked.
  // Absent, the rows still read — they simply do not offer to open.
  onReveal: F,
  storeId: w = "default",
  sessionId: R = null,
  debug: D = !1,
  onVoiceActiveChange: z
}) {
  const _ = ae(null), O = ae(null), B = oa(), K = _e();
  te(() => {
    if (!Array.isArray(B) || (O.current === null && (O.current = new Set(B.map((G) => G.id))), !B.length)) return;
    const y = [...B].reverse().find((G) => G.metadata && (G.metadata.openForm || G.metadata.sessionEnded));
    if (!(!y || _.current === y.id)) {
      if (_.current = y.id, O.current.has(y.id)) {
        K.resetSession();
        return;
      }
      y.metadata.openForm && M && M(y.metadata.openForm), K.resetSession();
    }
  }, [B, M, K]), Io({
    apiBaseUrl: e,
    userId: t,
    getAuthHeaders: a,
    fetchImpl: s,
    eventSourceImpl: o,
    onSubmitted: k,
    onError: S,
    onSessionStart: C,
    onReveal: F,
    debug: D
  });
  const ie = n && n.userId ? n : t ? { userId: t } : null, [se] = er();
  return te(() => {
    u && !Vo() && ua({ language: u });
  }, [u]), te(() => {
    bo(se.language);
  }, [se.language]), /* @__PURE__ */ g(Zi, { i18n: ue, children: /* @__PURE__ */ g(jo, { storeId: w, children: /* @__PURE__ */ g(
    hg,
    {
      showDraftPanel: c,
      showLanguageSwitcher: f,
      showVoiceControls: h,
      showAttachments: d,
      className: p,
      serviceId: l,
      sessionId: R,
      emptyState: m ?? v,
      userProfile: ie,
      userAvatar: r,
      assistantAvatar: i,
      anchorContext: N,
      compact: A,
      onNavigate: I,
      onVoiceActiveChange: z
    }
  ) }) });
}
const bs = Jn({
  isOpen: !1,
  anchorContext: null,
  openChat: () => {
  },
  closeChat: () => {
  }
});
function wg({ children: e, storeId: t = "default" }) {
  const [n, r] = ne(!1), [i, a] = ne(null), s = Se((u = null) => {
    a(u || null), r(!0);
  }, []), o = Se(() => {
    r(!1);
  }, []);
  return te(() => {
    const u = (c) => s(c && c.detail ? c.detail : null), l = () => o();
    return window.addEventListener("openAltioraChat", u), window.addEventListener("closeAltioraChat", l), () => {
      window.removeEventListener("openAltioraChat", u), window.removeEventListener("closeAltioraChat", l);
    };
  }, [s, o]), /* @__PURE__ */ g(bs.Provider, { value: { isOpen: n, anchorContext: i, openChat: s, closeChat: o, storeId: t }, children: e });
}
const gg = () => Yn(bs);
function mg() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }),
        /* @__PURE__ */ g("path", { d: "M20 3v4" }),
        /* @__PURE__ */ g("path", { d: "M22 5h-4" }),
        /* @__PURE__ */ g("path", { d: "M4 17v2" }),
        /* @__PURE__ */ g("path", { d: "M5 18H3" })
      ]
    }
  );
}
function yg({ anchorContext: e, closeChat: t, chatProps: n, storeId: r }) {
  const { t: i } = ee();
  te(() => {
    const u = (l) => {
      l.key === "Escape" && t();
    };
    return document.addEventListener("keydown", u), () => document.removeEventListener("keydown", u);
  }, [t]);
  const a = e && e.anchorTitle;
  return /* @__PURE__ */ g("div", { className: "fdv2-floating-overlay", children: /* @__PURE__ */ T("div", { className: "fdv2-floating-window", role: "dialog", "aria-modal": "true", "aria-label": a || "Ask altiora AI", children: [
    /* @__PURE__ */ T("header", { className: "fdv2-floating-header", children: [
      /* @__PURE__ */ T("span", { className: "fdv2-floating-title-group", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-floating-icon", "aria-hidden": "true", children: /* @__PURE__ */ g(mg, {}) }),
        /* @__PURE__ */ g("span", { className: "fdv2-floating-title", children: a || /* @__PURE__ */ T(Jt, { children: [
          "Ask ",
          /* @__PURE__ */ g("span", { className: "fdv2-floating-title-brand", children: "altiora" }),
          " AI"
        ] }) })
      ] }),
      /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-floating-close",
          "aria-label": i("floatingChat.close"),
          onClick: t,
          children: "×"
        }
      )
    ] }),
    /* @__PURE__ */ g("div", { className: "fdv2-floating-body", children: /* @__PURE__ */ g(pg, { ...n, storeId: r, anchorContext: e, compact: !0, onClose: t }) })
  ] }) });
}
function Sg({ chatProps: e }) {
  const { isOpen: t, anchorContext: n, closeChat: r, storeId: i } = gg();
  return t ? qi(
    /* @__PURE__ */ g(Zi, { i18n: ue, children: /* @__PURE__ */ g(yg, { anchorContext: n, closeChat: r, chatProps: e || {}, storeId: i }) }),
    document.body
  ) : null;
}
function xs(e, t) {
  window.dispatchEvent(new CustomEvent("altioraVoiceExplain", { detail: { anchorId: e, anchorTitle: t } }));
}
function Cg({ anchorId: e, anchorTitle: t, className: n = "" }) {
  const { t: r } = ee();
  if (!e) return null;
  const i = t || e;
  return /* @__PURE__ */ g(
    "button",
    {
      type: "button",
      className: `fdv2-explain-trigger${n ? ` ${n}` : ""}`,
      onClick: (a) => {
        a.stopPropagation(), xs(e, i);
      },
      "aria-label": r("explain.trigger", { title: i }),
      title: r("explain.triggerTooltip"),
      children: "?"
    }
  );
}
function Eg(e) {
  const { t } = ee();
  te(() => {
    const n = e && e.current || document.body, r = (s) => {
      const o = s.getAttribute("data-kb-anchor");
      if (!o || s.querySelector(":scope > .fdv2-explain-trigger")) return;
      const u = s.getAttribute("data-kb-title") || o;
      window.getComputedStyle(s).position === "static" && (s.style.position = "relative");
      const l = document.createElement("button");
      l.type = "button", l.className = "fdv2-explain-trigger", l.textContent = "?", l.setAttribute("aria-label", t("explain.trigger", { title: u })), l.title = t("explain.triggerTooltip"), l.addEventListener("click", (c) => {
        c.stopPropagation(), xs(o, u);
      }), s.appendChild(l);
    }, i = () => {
      n.matches && n.matches("[data-kb-anchor]") && r(n), n.querySelectorAll("[data-kb-anchor]").forEach(r);
    };
    i();
    const a = new MutationObserver(i);
    return a.observe(n, { childList: !0, subtree: !0 }), () => {
      a.disconnect(), n.querySelectorAll(".fdv2-explain-trigger").forEach((s) => s.remove());
    };
  }, [e, t]);
}
export {
  ig as AISettingsDialog,
  Mn as AI_PREFS_EVENT,
  Qt as AI_PREFS_KEY,
  pg as AltioraChat,
  J as ChatError,
  jo as ChatStoreProvider,
  dn as DEFAULT_AI_PREFS,
  Cg as ExplainTrigger,
  wg as FloatingChatProvider,
  Sg as FloatingChatWindow,
  Qn as LANGUAGES,
  vg as SSE_EVENTS,
  Vi as VOICE_OPTIONS,
  be as chatClient,
  Io as configureChat,
  Vr as currentDir,
  rt as currentLang,
  pg as default,
  yo as dirFor,
  ms as effectiveVoice,
  $t as getAIPrefs,
  ia as getChatStore,
  we as getConfig,
  Qp as getDefaultVoice,
  xr as getVoicesForLanguage,
  Vo as hasStoredAIPrefs,
  ue as i18n,
  Xp as isValidVoice,
  ra as linkAttachments,
  Do as linkStagedAttachments,
  ua as setAIPrefs,
  bo as setLang,
  Po as uploadFile,
  er as useAIPrefs,
  Ye as useActiveStore,
  _e as useChatActions,
  aa as useChatStore,
  $o as useDraft,
  gg as useFloatingChat,
  Eg as useKBAnchors,
  oa as useMessages,
  Bo as useSchema,
  la as useSession,
  Ce as useUI
};
//# sourceMappingURL=flowdesk-chat-v2.js.map
