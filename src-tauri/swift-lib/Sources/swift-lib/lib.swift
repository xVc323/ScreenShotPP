import SwiftRs
import Foundation
import Vision
import CoreGraphics
import ImageIO

@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData) -> SRString {
    let cfData = Data(data.toArray()) as CFData
    guard let source = CGImageSourceCreateWithData(cfData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return response(error: "Image OCR invalide")
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
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

private func response(text: String? = nil, error: String? = nil) -> SRString {
    let object = text.map { ["text": $0] } ?? ["error": error ?? "Erreur OCR inconnue"]
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let json = String(data: data, encoding: .utf8) else {
        return SRString("{\"error\":\"Réponse OCR invalide\"}")
    }
    return SRString(json)
}
