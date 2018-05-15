import { TxtReader } from '../txt-reader'
if (typeof window.TxtReader === 'undefined') {
    window.TxtReader = TxtReader;
}