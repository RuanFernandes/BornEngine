#[derive(Default)]
pub(crate) struct WindowsTextDecoder {
    pending_high_surrogate: Option<u16>,
}

impl WindowsTextDecoder {
    pub(crate) fn decode_char_unit(&mut self, unit: u16) -> Vec<char> {
        let mut characters = Vec::with_capacity(2);
        match unit {
            0xD800..=0xDBFF => {
                if self.pending_high_surrogate.replace(unit).is_some() {
                    characters.push('\u{FFFD}');
                }
            }
            0xDC00..=0xDFFF => {
                if let Some(high) = self.pending_high_surrogate.take() {
                    let scalar =
                        0x1_0000 + ((u32::from(high) - 0xD800) << 10) + (u32::from(unit) - 0xDC00);
                    characters.push(char::from_u32(scalar).unwrap_or('\u{FFFD}'));
                } else {
                    characters.push('\u{FFFD}');
                }
            }
            _ => {
                if self.pending_high_surrogate.take().is_some() {
                    characters.push('\u{FFFD}');
                }
                if let Some(character) = char::from_u32(u32::from(unit)) {
                    characters.push(character);
                }
            }
        }
        characters.retain(|character| !character.is_control());
        characters
    }

    pub(crate) fn decode_unichar(&mut self, scalar: u32) -> Vec<char> {
        let mut characters = Vec::with_capacity(2);
        if self.pending_high_surrogate.take().is_some() {
            characters.push('\u{FFFD}');
        }
        if let Some(character) = char::from_u32(scalar) {
            characters.push(character);
        }
        characters.retain(|character| !character.is_control());
        characters
    }
}

#[cfg(test)]
mod tests {
    use super::WindowsTextDecoder;

    #[test]
    fn windows_text_decoder_combines_utf16_surrogate_pairs() {
        let mut decoder = WindowsTextDecoder::default();

        assert!(decoder.decode_char_unit(0xD83D).is_empty());
        assert_eq!(decoder.decode_char_unit(0xDE00), ['😀']);
    }

    #[test]
    fn windows_text_decoder_accepts_bmp_and_unichar_codepoints() {
        let mut decoder = WindowsTextDecoder::default();

        assert_eq!(decoder.decode_char_unit('é' as u16), ['é']);
        assert_eq!(decoder.decode_unichar(0x1F680), ['🚀']);
    }
}
