// This file is used to fix an issue in text-encoding-shim
// See https://gitlab.com/PseudoPsycho/text-encoding-shim/issues/1 for details

if (typeof window === 'undefined' && typeof self !== 'undefined') {
    self['window'] = self;
}
import { TextDecoder } from 'text-encoding-shim'
export { TextDecoder }