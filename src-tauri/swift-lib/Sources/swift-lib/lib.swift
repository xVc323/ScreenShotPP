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

@_cdecl("foreground_window_selection_json")
public func foreground_window_selection_json(
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

        let clipped = bounds.intersection(monitor)
        guard !clipped.isNull, clipped.width >= 2, clipped.height >= 2 else {
            continue
        }

        let bandHeight = min(bounds.height, max(32, min(120, (bounds.height * 0.10).rounded())))
        let activation = CGRect(x: bounds.minX, y: bounds.minY, width: bounds.width, height: bandHeight)
            .intersection(monitor)
        guard !activation.isNull, activation.width >= 2, activation.height >= 2 else {
            continue
        }

        let response: [String: Any] = [
            "selection": rectObject(clipped, relativeTo: monitor),
            "activation": rectObject(activation, relativeTo: monitor),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: response),
              let json = String(data: data, encoding: .utf8) else {
            return SRString("null")
        }
        return SRString(json)
    }

    return SRString("null")
}

private func rectObject(_ rect: CGRect, relativeTo origin: CGRect) -> [String: UInt32] {
    return [
        "x": UInt32(max(0, (rect.minX - origin.minX).rounded())),
        "y": UInt32(max(0, (rect.minY - origin.minY).rounded())),
        "width": UInt32(max(0, rect.width.rounded())),
        "height": UInt32(max(0, rect.height.rounded())),
    ]
}

private func response(text: String? = nil, error: String? = nil) -> SRString {
    let object = text.map { ["text": $0] } ?? ["error": error ?? "Erreur OCR inconnue"]
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let json = String(data: data, encoding: .utf8) else {
        return SRString("{\"error\":\"Réponse OCR invalide\"}")
    }
    return SRString(json)
}
