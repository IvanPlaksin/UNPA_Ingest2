/**
 * Temporal / integer (de)serialization for UGP.
 *
 * neo4j-driver returns rich temporal objects (DateTime, Date, Duration, …) and,
 * when lossless integers are enabled, Integer objects. JSON can't carry those, so
 * we wrap them in a tagged `{$type, value}` envelope on export and reconstruct on
 * import. Reconstruction is best-effort and guarded: if a driver version lacks a
 * given constructor we fall back to the string value (lossless in value, if not
 * in native type), which Memgraph accepts as a property.
 */
const neo4j = require('neo4j-driver');

const T = (neo4j && neo4j.types) || {};

function isTemporalInstance(value, Ctor) {
    return Ctor && value instanceof Ctor;
}

/**
 * Wrap a single scalar value if it is a neo4j temporal or integer.
 * Plain scalars pass through unchanged.
 */
function wrapTemporal(value) {
    if (value === null || value === undefined) return value;

    if (neo4j.isInt && neo4j.isInt(value)) {
        // Prefer a JS number when it fits; otherwise keep the string form.
        return value.inSafeRange && value.inSafeRange() ? value.toNumber() : value.toString();
    }
    if (isTemporalInstance(value, T.DateTime)) return { $type: 'datetime', value: value.toString() };
    if (isTemporalInstance(value, T.LocalDateTime)) return { $type: 'localdatetime', value: value.toString() };
    if (isTemporalInstance(value, T.Date)) return { $type: 'date', value: value.toString() };
    if (isTemporalInstance(value, T.Time)) return { $type: 'time', value: value.toString() };
    if (isTemporalInstance(value, T.LocalTime)) return { $type: 'localtime', value: value.toString() };
    if (isTemporalInstance(value, T.Duration)) return { $type: 'duration', value: value.toString() };

    return value;
}

/**
 * Reconstruct a wrapped temporal envelope back into a neo4j temporal type.
 * Falls back to the raw string value on any parsing/constructor error.
 */
function unwrapTemporal(value) {
    if (!value || typeof value !== 'object' || !value.$type) return value;

    try {
        switch (value.$type) {
            case 'datetime':
                return T.DateTime.fromStandardDate(new Date(value.value));
            case 'localdatetime':
                // No lossless standard-date path; keep string (Memgraph stores as string).
                return value.value;
            case 'date': {
                const [y, m, d] = String(value.value).split('-').map(Number);
                if ([y, m, d].some((n) => Number.isNaN(n))) return value.value;
                return new T.Date(neo4j.int(y), neo4j.int(m), neo4j.int(d));
            }
            case 'duration':
                return typeof T.Duration.fromIso === 'function' ? T.Duration.fromIso(value.value) : value.value;
            case 'time':
            case 'localtime':
            default:
                return value.value;
        }
    } catch {
        return value.value;
    }
}

/** Recursively wrap temporals/ints across an object/array tree. */
function wrapPropertiesDeep(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(wrapPropertiesDeep);

    // Already-wrapped envelope: leave as-is.
    if (typeof obj === 'object' && obj.$type) return obj;

    // neo4j temporal/int instances are objects but must be wrapped, not walked.
    const wrapped = wrapTemporal(obj);
    if (wrapped !== obj) return wrapped; // was a temporal/int scalar

    if (typeof obj === 'object' && obj.constructor === Object) {
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = wrapPropertiesDeep(v);
        }
        return result;
    }
    return obj;
}

/** Recursively unwrap tagged temporal envelopes across an object/array tree. */
function unwrapPropertiesDeep(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(unwrapPropertiesDeep);
    if (typeof obj === 'object' && obj.$type) return unwrapTemporal(obj);
    if (typeof obj === 'object' && obj.constructor === Object) {
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = unwrapPropertiesDeep(v);
        }
        return result;
    }
    return obj;
}

module.exports = {
    wrapTemporal,
    unwrapTemporal,
    wrapPropertiesDeep,
    unwrapPropertiesDeep,
};
