import SwiftRs
import Foundation

// Étape de dérisquage : fonction triviale pour valider le pont Swift ↔ Rust.
// Sera remplacée par la vraie reconnaissance Vision à la Task 2.
@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData) -> SRString {
    return SRString("BRIDGE_OK \(data.toArray().count) bytes")
}
