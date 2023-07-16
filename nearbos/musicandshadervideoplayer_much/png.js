export async function decodeBufferFromPNG(url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    await img.decode();
    const canv = document.createElement('canvas');
    canv.width = img.width;
    canv.height = img.height;

    const ctx = canv.getContext('2d');
    // Draw image to canvas
    ctx.drawImage(img, 0, 0);
    // Retrieve RGBA data
    let data = ctx.getImageData(0, 0, img.width, img.height).data;
    // Only return R channel (identical to G and B channels)
    data = data.filter((_, idx) => { return idx % 4 === 0 });
    // Extract byte count from first 4 bytes (32-bit, unsigned, little endian)
    const length = data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24);

    return data.slice(4, length + 4);
}
