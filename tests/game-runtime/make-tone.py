import math
import struct
import wave
from pathlib import Path

rate = 22050
count = rate // 4
path = Path('tests/game-runtime/assets/tone.wav')
path.parent.mkdir(parents=True, exist_ok=True)
frames = bytearray()
for index in range(count):
    sample = int(12000 * math.sin(2 * math.pi * 440 * index / rate))
    frames.extend(struct.pack('<h', sample))
with wave.open(str(path), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(bytes(frames))
