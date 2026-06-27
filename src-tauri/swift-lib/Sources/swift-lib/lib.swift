import SwiftRs
import AppKit
import Foundation
import Vision
import CoreGraphics
import ImageIO

@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData, _ langs: SRString) -> SRString {
    let cfData = Data(data.toArray()) as CFData
    guard let source = CGImageSourceCreateWithData(cfData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return response(error: "Image OCR invalide")
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let langValue = langs.toString()
    if langValue == "auto" {
        if #available(macOS 13.0, *) {
            request.automaticallyDetectsLanguage = true
        }
    } else {
        request.recognitionLanguages = langValue.split(separator: ",").map(String.init)
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return response(error: "Reconnaissance OCR échouée: \(error.localizedDescription)")
    }
    let lines: [String] = (request.results ?? []).compactMap { observation in
        observation.topCandidates(1).first?.string
    }
    return response(text: lines.joined(separator: "\n"))
}

// Renvoie les bounds bruts de la fenêtre au premier plan située sur ce moniteur,
// en points logiques (origine haut-gauche, espace CGWindowList), sous la forme
// {x, y, width, height}, ou "null". Le clipping au moniteur, la bande d'activation
// et la conversion en pixels physiques sont réalisés côté Rust (code partagé et
// testé), pour que macOS et Windows suivent le même chemin de géométrie.
@_cdecl("foreground_window_bounds_json")
public func foreground_window_bounds_json(
    _ monitorX: Int32,
    _ monitorY: Int32,
    _ monitorWidth: UInt32,
    _ monitorHeight: UInt32
) -> SRString {
    guard let app = NSWorkspace.shared.frontmostApplication else {
        return SRString("null")
    }
    let pid = app.processIdentifier
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return SRString("null")
    }

    let monitor = CGRect(
        x: CGFloat(monitorX),
        y: CGFloat(monitorY),
        width: CGFloat(monitorWidth),
        height: CGFloat(monitorHeight)
    )

    for window in list {
        guard let ownerPid = window[kCGWindowOwnerPID as String] as? pid_t,
              ownerPid == pid,
              let layer = window[kCGWindowLayer as String] as? Int,
              layer == 0,
              let boundsDict = window[kCGWindowBounds as String] as? [String: Any],
              let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
              bounds.width >= 2,
              bounds.height >= 2
        else {
            continue
        }

        // Ne garde que la fenêtre qui recouvre réellement ce moniteur ; le reste
        // de la géométrie (clipping/relatif) est délégué au Rust.
        let clipped = bounds.intersection(monitor)
        guard !clipped.isNull, clipped.width >= 2, clipped.height >= 2 else {
            continue
        }

        let response: [String: Int32] = [
            "x": Int32(bounds.minX.rounded()),
            "y": Int32(bounds.minY.rounded()),
            "width": Int32(max(0, bounds.width.rounded())),
            "height": Int32(max(0, bounds.height.rounded())),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: response),
              let json = String(data: data, encoding: .utf8) else {
            return SRString("null")
        }
        return SRString(json)
    }

    return SRString("null")
}

private func response(text: String? = nil, error: String? = nil) -> SRString {
    let object = text.map { ["text": $0] } ?? ["error": error ?? "Erreur OCR inconnue"]
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let json = String(data: data, encoding: .utf8) else {
        return SRString("{\"error\":\"Réponse OCR invalide\"}")
    }
    return SRString(json)
}
