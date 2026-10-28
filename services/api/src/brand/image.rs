//! Logo validation and processing.
//!
//! - Formats are sniffed from the bytes (never trusted from the request) and
//!   must match the declared type: SVG, PNG or WebP.
//! - SVGs are parsed and re-serialised by usvg: scripts, event handlers,
//!   `foreignObject`, external references and embedded images do not survive,
//!   and no file or network access is possible while parsing.
//! - Rasters are fully decoded with allocation limits (decompression bombs are
//!   refused) and stored byte for byte, so official artwork keeps its quality.
//! - Downscaled WebP renditions are generated for responsive delivery; the
//!   aspect ratio is always preserved and nothing is ever upscaled.

use std::io::Cursor;

use image::{DynamicImage, ImageFormat, ImageReader, Limits, imageops::FilterType};
use sha2::{Digest, Sha256};

pub const MAX_RASTER_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SVG_BYTES: usize = 512 * 1024;
const MIN_SIDE: u32 = 16;
const MAX_SIDE: u32 = 8192;
/// Rendition widths (only those narrower than the original are made).
pub const RENDITION_WIDTHS: [u32; 4] = [64, 160, 320, 640];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Svg,
    Png,
    Webp,
}

impl Kind {
    pub fn content_type(self) -> &'static str {
        match self {
            Kind::Svg => "image/svg+xml",
            Kind::Png => "image/png",
            Kind::Webp => "image/webp",
        }
    }

    pub fn from_content_type(value: &str) -> Option<Self> {
        match value.split(';').next()?.trim() {
            "image/svg+xml" => Some(Kind::Svg),
            "image/png" => Some(Kind::Png),
            "image/webp" => Some(Kind::Webp),
            _ => None,
        }
    }
}

/// A validated logo, ready to store.
pub struct Processed {
    pub kind: Kind,
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
    pub sha256: String,
    pub renditions: Vec<(u32, Vec<u8>)>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Rejection {
    Type,
    Mismatch,
    TooLarge,
    Unreadable,
    Dimensions,
    SvgText,
    SvgUnsafe,
}

impl Rejection {
    pub fn message(&self) -> &'static str {
        match self {
            Rejection::Type => "Upload an SVG, PNG or WebP file.",
            Rejection::Mismatch => "The file's contents don't match its type. Export it again and retry.",
            Rejection::TooLarge => "Files can be up to 2 MB (SVG up to 512 KB).",
            Rejection::Unreadable => "The image couldn't be read. Export it again and retry.",
            Rejection::Dimensions => "Images must be between 16 and 8192 pixels on each side.",
            Rejection::SvgText => "Convert text to outlines in your design tool before uploading the SVG.",
            Rejection::SvgUnsafe => {
                "SVGs can't contain scripts, embedded images, external links or document type declarations."
            }
        }
    }
}

pub fn sniff(bytes: &[u8]) -> Option<Kind> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(Kind::Png);
    }
    if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(Kind::Webp);
    }
    let text = std::str::from_utf8(bytes).ok()?;
    let start = text.trim_start_matches('\u{feff}').trim_start();
    (start.starts_with("<?xml") || start.starts_with("<svg") || start.starts_with("<!--"))
        .then_some(Kind::Svg)
        .filter(|_| text.contains("<svg"))
}

pub fn process(bytes: &[u8], declared: Kind) -> Result<Processed, Rejection> {
    let kind = sniff(bytes).ok_or(Rejection::Type)?;
    if kind != declared {
        return Err(Rejection::Mismatch);
    }
    let limit = if kind == Kind::Svg {
        MAX_SVG_BYTES
    } else {
        MAX_RASTER_BYTES
    };
    if bytes.len() > limit {
        return Err(Rejection::TooLarge);
    }
    match kind {
        Kind::Svg => process_svg(bytes),
        Kind::Png | Kind::Webp => process_raster(bytes, kind),
    }
}

fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn check_side(width: u32, height: u32) -> Result<(), Rejection> {
    if (MIN_SIDE..=MAX_SIDE).contains(&width) && (MIN_SIDE..=MAX_SIDE).contains(&height) {
        Ok(())
    } else {
        Err(Rejection::Dimensions)
    }
}

fn process_raster(bytes: &[u8], kind: Kind) -> Result<Processed, Rejection> {
    let format = if kind == Kind::Png {
        ImageFormat::Png
    } else {
        ImageFormat::WebP
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| Rejection::Unreadable)?;
    check_side(image.width(), image.height())?;
    let has_alpha = image.color().has_alpha() && image.to_rgba8().pixels().any(|p| p.0[3] < 255);
    Ok(Processed {
        kind,
        data: bytes.to_vec(),
        width: image.width(),
        height: image.height(),
        has_alpha,
        sha256: digest(bytes),
        renditions: renditions(&image),
    })
}

fn renditions(image: &DynamicImage) -> Vec<(u32, Vec<u8>)> {
    RENDITION_WIDTHS
        .iter()
        .filter(|&&w| w < image.width())
        .filter_map(|&w| rendition(image, w))
        .collect()
}

fn rendition(image: &DynamicImage, w: u32) -> Option<(u32, Vec<u8>)> {
    let h = ((image.height() as f64 * w as f64 / image.width() as f64).round() as u32).max(1);
    let resized = image.resize_exact(w, h, FilterType::Lanczos3).to_rgba8();
    let mut out = Vec::new();
    image::codecs::webp::WebPEncoder::new_lossless(&mut out)
        .encode(&resized, w, h, image::ExtendedColorType::Rgba8)
        .ok()?;
    Some((w, out))
}

fn process_svg(bytes: &[u8]) -> Result<Processed, Rejection> {
    let text = std::str::from_utf8(bytes).map_err(|_| Rejection::Unreadable)?;
    let lower = text.to_ascii_lowercase();
    // usvg would drop these silently; refuse them so nobody publishes a logo
    // that renders differently from what they designed.
    if [
        "<!doctype",
        "<!entity",
        "<script",
        "<foreignobject",
        "<image",
        "javascript:",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        return Err(Rejection::SvgUnsafe);
    }
    if lower.contains("<text") {
        return Err(Rejection::SvgText);
    }

    let options = usvg::Options {
        resources_dir: None,
        // No file system or network access for `href`s.
        image_href_resolver: usvg::ImageHrefResolver {
            resolve_data: Box::new(|_, _, _| None),
            resolve_string: Box::new(|_, _| None),
        },
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_data(bytes, &options).map_err(|_| Rejection::Unreadable)?;
    let size = tree.size();
    let (width, height) = (size.width().round() as u32, size.height().round() as u32);
    check_side(width, height)?;
    let clean = tree.to_string(&usvg::WriteOptions::default()).into_bytes();

    // Rasterise once at a large width to derive renditions (and transparency).
    let target = 640u32.max(width).min(1280);
    let scale = target as f32 / size.width();
    let raster_h = ((size.height() * scale).round() as u32).max(1);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(target, raster_h).ok_or(Rejection::Dimensions)?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    let rgba = image::RgbaImage::from_raw(target, raster_h, demultiply(pixmap.data()))
        .ok_or(Rejection::Unreadable)?;
    let has_alpha = rgba.pixels().any(|p| p.0[3] < 255);
    let renditions = renditions(&DynamicImage::ImageRgba8(rgba));

    Ok(Processed {
        kind: Kind::Svg,
        sha256: digest(&clean),
        data: clean,
        width,
        height,
        has_alpha,
        renditions,
    })
}

/// tiny-skia stores premultiplied RGBA; image expects straight alpha.
fn demultiply(data: &[u8]) -> Vec<u8> {
    let (pixels, _) = data.as_chunks::<4>();
    pixels
        .iter()
        .flat_map(|px| {
            let a = px[3] as u16;
            if a == 0 {
                [0, 0, 0, 0]
            } else {
                let un = |c: u8| ((c as u16 * 255 + a / 2) / a).min(255) as u8;
                [un(px[0]), un(px[1]), un(px[2]), px[3]]
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" width="64" height="32"><rect width="64" height="32" rx="6" fill="#F97316"/></svg>"##;

    fn png(width: u32, height: u32, alpha: u8) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba([10, 200, 240, alpha]));
        let mut out = Cursor::new(Vec::new());
        image.write_to(&mut out, ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn sniffs_formats_from_bytes() {
        assert_eq!(sniff(&png(20, 20, 255)), Some(Kind::Png));
        assert_eq!(sniff(SVG.as_bytes()), Some(Kind::Svg));
        assert_eq!(sniff(b"GIF89a...."), None);
        assert_eq!(sniff(b"<html><body>hi</body></html>"), None);
    }

    #[test]
    fn rasters_keep_their_bytes_and_get_renditions() {
        let bytes = png(800, 400, 0);
        let processed = process(&bytes, Kind::Png).unwrap();
        assert_eq!((processed.width, processed.height), (800, 400));
        assert!(processed.has_alpha);
        assert_eq!(processed.data, bytes, "rasters are stored unchanged");
        let widths: Vec<u32> = processed.renditions.iter().map(|(w, _)| *w).collect();
        assert_eq!(widths, vec![64, 160, 320, 640]);
        let small = image::load_from_memory(&processed.renditions[0].1).unwrap();
        assert_eq!(
            (small.width(), small.height()),
            (64, 32),
            "aspect ratio preserved"
        );
    }

    #[test]
    fn refuses_mismatches_tiny_images_and_garbage() {
        assert_eq!(
            process(&png(20, 20, 255), Kind::Svg).err(),
            Some(Rejection::Mismatch)
        );
        assert_eq!(
            process(&png(8, 8, 255), Kind::Png).err(),
            Some(Rejection::Dimensions)
        );
        let mut broken = png(40, 40, 255);
        broken.truncate(60);
        assert_eq!(process(&broken, Kind::Png).err(), Some(Rejection::Unreadable));
    }

    #[test]
    fn svgs_are_sanitised_and_rasterised() {
        let processed = process(SVG.as_bytes(), Kind::Svg).unwrap();
        assert_eq!((processed.width, processed.height), (64, 32));
        let clean = String::from_utf8(processed.data).unwrap();
        assert!(clean.contains("<svg") && clean.contains("path"));
        assert!(processed.has_alpha, "rounded corners are transparent");
        assert!(!processed.renditions.is_empty());

        for hostile in [
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script></svg>"#,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><image href="file:///etc/passwd" width="20" height="20"/></svg>"#,
            r#"<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>"#,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><a href="javascript:alert(1)"><rect width="9" height="9"/></a></svg>"#,
        ] {
            assert_eq!(
                process(hostile.as_bytes(), Kind::Svg).err(),
                Some(Rejection::SvgUnsafe),
                "{hostile}"
            );
        }
        let with_handler = r#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="alert(1)"><rect width="20" height="20" onclick="x()"/></svg>"#;
        let clean = String::from_utf8(process(with_handler.as_bytes(), Kind::Svg).unwrap().data).unwrap();
        assert!(!clean.contains("onload") && !clean.contains("onclick"), "{clean}");
        let text = r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text>Hi</text></svg>"#;
        assert_eq!(
            process(text.as_bytes(), Kind::Svg).err(),
            Some(Rejection::SvgText)
        );
    }
}

/// Square icon sizes the websites ask for: browser tabs (16, 32, 48), the
/// Apple touch icon (180) and installable-app icons (192, 512).
pub const ICON_SIZES: [u32; 6] = [16, 32, 48, 180, 192, 512];

/// A stored logo as a `size` x `size` PNG: fitted without distortion and
/// centred on a transparent square. Stored files are already validated, so
/// this only fails for unknown sizes or unreadable data.
pub fn icon_png(content_type: &str, data: &[u8], size: u32) -> Option<Vec<u8>> {
    if !ICON_SIZES.contains(&size) {
        return None;
    }
    let source = if content_type == "image/svg+xml" {
        let tree = usvg::Tree::from_data(data, &usvg::Options::default()).ok()?;
        let (w, h) = (tree.size().width(), tree.size().height());
        // Render at twice the size, then downscale, for smooth small icons.
        let scale = (size * 2) as f32 / w.max(h);
        let (pw, ph) = (
            ((w * scale).round() as u32).max(1),
            ((h * scale).round() as u32).max(1),
        );
        let mut pixmap = resvg::tiny_skia::Pixmap::new(pw, ph)?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(scale, scale),
            &mut pixmap.as_mut(),
        );
        DynamicImage::ImageRgba8(image::RgbaImage::from_raw(pw, ph, demultiply(pixmap.data()))?)
    } else {
        ImageReader::new(Cursor::new(data))
            .with_guessed_format()
            .ok()?
            .decode()
            .ok()?
    };
    let fitted = source.resize(size, size, FilterType::Lanczos3).to_rgba8();
    let mut canvas = image::RgbaImage::new(size, size);
    let (x, y) = ((size - fitted.width()) / 2, (size - fitted.height()) / 2);
    image::imageops::overlay(&mut canvas, &fitted, x.into(), y.into());
    let mut out = Vec::new();
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .ok()?;
    Some(out)
}

#[cfg(test)]
mod icon_tests {
    use super::*;

    #[test]
    fn icons_are_square_pngs_of_the_requested_size() {
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#0b6edb"/></svg>"##;
        for size in ICON_SIZES {
            let png = icon_png("image/svg+xml", svg, size).expect("renders");
            let decoded = image::load_from_memory(&png).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (size, size));
            // A wide logo is centred, not stretched: the top row stays transparent.
            assert_eq!(decoded.to_rgba8().get_pixel(size / 2, 0).0[3], 0);
        }
        assert!(
            icon_png("image/svg+xml", svg, 100).is_none(),
            "only the listed sizes"
        );
    }
}
