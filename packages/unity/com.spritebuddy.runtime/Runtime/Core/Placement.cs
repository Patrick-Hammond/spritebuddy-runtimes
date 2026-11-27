namespace SpriteBuddy
{
    /// <summary>
    /// Where Unity draws one <see cref="Part"/>: the sprite to cut from the sheet and the local
    /// transform that puts it in place. Pure arithmetic, so it's tested without Unity.
    /// </summary>
    /// <remarks>
    /// The sprite is the frame's pixels as stored on the sheet (a rotated frame's turned pixels),
    /// with its pivot at their top-left corner. Turning it back upright is a quarter turn
    /// counter-clockwise. Flips are mirrors in the sprite's own space, before it turns: Unity
    /// draws them with <c>SpriteRenderer.flipX</c> and <c>flipY</c>, which URP's 2D lights read
    /// to flip the normals too (a negative transform scale would light them from the wrong side).
    /// </remarks>
    public struct Placement
    {
        /// <summary>The stored pixels in texture coordinates: x right, y up from the bottom-left (Unity's rule).</summary>
        public int SpriteX, SpriteY, SpriteWidth, SpriteHeight;
        /// <summary>The sprite's local position in Unity units (y up), from the sprite's origin.</summary>
        public float X, Y;
        /// <summary>The sprite's local rotation about z, in degrees counter-clockwise: 0, 90 or -90.</summary>
        public float Rotation;
        /// <summary>-1 to mirror the sprite in its own space (SpriteRenderer.flipX and flipY), else 1.</summary>
        public float ScaleX, ScaleY;

        /// <summary>The stored pixels of <paramref name="frame"/> as a rect in texture coordinates (y up).</summary>
        public static void SpriteRect(FrameDef frame, int sheetHeight, out int x, out int y, out int width, out int height)
        {
            width = frame.Rotated ? frame.Height : frame.Width;
            height = frame.Rotated ? frame.Width : frame.Height;
            x = frame.X;
            y = sheetHeight - frame.Y - height;
        }

        /// <summary>Places <paramref name="part"/> for a sheet <paramref name="sheetHeight"/> pixels tall, at <paramref name="pixelsPerUnit"/>.</summary>
        public static Placement Of(Part part, int sheetHeight, float pixelsPerUnit)
        {
            var frame = part.Frame;
            var placement = new Placement();
            SpriteRect(frame, sheetHeight, out placement.SpriteX, out placement.SpriteY, out placement.SpriteWidth, out placement.SpriteHeight);
            // Where the stored pixels' top-left corner lands in the full frame (sheet pixels, y down).
            float x = frame.Trimmed ? frame.TrimX : 0;
            float y = frame.Trimmed ? frame.TrimY : 0;
            // Turned back upright, the stored top-left becomes the bottom-left of the upright pixels.
            if (frame.Rotated) y += frame.Height;
            if (part.FlipX) x = frame.FullWidth - x;
            if (part.FlipY) y = frame.FullHeight - y;
            placement.X = (part.X + x) / pixelsPerUnit;
            placement.Y = -(part.Y + y) / pixelsPerUnit;
            placement.ScaleX = part.FlipX ? -1 : 1;
            placement.ScaleY = part.FlipY ? -1 : 1;
            // A mirror turns a rotation the other way, and the mirror comes before the turn.
            placement.Rotation = !frame.Rotated ? 0 : part.FlipX == part.FlipY ? 90 : -90;
            return placement;
        }

        /// <summary>
        /// This placement with the whole sprite mirrored about its origin (where the character
        /// stands): left for right with <paramref name="flipX"/>, up for down with <paramref name="flipY"/>.
        /// </summary>
        public Placement Mirrored(bool flipX, bool flipY)
        {
            var mirrored = this;
            if (flipX)
            {
                mirrored.X = -mirrored.X;
                mirrored.ScaleX = -mirrored.ScaleX;
                mirrored.Rotation = -mirrored.Rotation;
            }
            if (flipY)
            {
                mirrored.Y = -mirrored.Y;
                mirrored.ScaleY = -mirrored.ScaleY;
                mirrored.Rotation = -mirrored.Rotation;
            }
            if (mirrored.Rotation == 0) mirrored.Rotation = 0; // Not -0.
            return mirrored;
        }

        /// <summary>
        /// Where a point of the stored pixels ends up, in sheet pixels (y down) from the sprite's
        /// origin: <paramref name="u"/> columns right and <paramref name="v"/> rows down from their
        /// top-left. For tests; Unity does this with the transform.
        /// </summary>
        public void Map(float u, float v, float pixelsPerUnit, out float x, out float y)
        {
            // Sprite space is y up with the pivot at the top-left: the point is (u, -v).
            var sx = u * ScaleX;
            var sy = -v * ScaleY;
            float rx = sx, ry = sy;
            if (Rotation == 90) { rx = -sy; ry = sx; }
            else if (Rotation == -90) { rx = sy; ry = -sx; }
            x = rx + X * pixelsPerUnit;
            y = -(ry + Y * pixelsPerUnit);
        }
    }
}
