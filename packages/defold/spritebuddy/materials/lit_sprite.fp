#version 140

// A SpriteBuddy sprite lit by one point light through its normal map, with the same light model
// as SpriteBuddy Pro's preview and @spritebuddy/pixi: each pixel's colour C becomes
// C * (ambient + brightness * d * colour), where d = clamp((n.l + w) / (1 + w), 0, 1), faded out
// towards the light's radius and optionally rounded to cel bands.

in mediump vec2 var_texcoord0;
in highp vec2 var_world;

out vec4 out_fragColor;

uniform mediump sampler2D texture_sampler;
uniform mediump sampler2D normal_sampler;

uniform fs_uniforms
{
    mediump vec4 tint;
    // xyz: the light's world position (z towards the viewer), w: its radius.
    highp vec4 light_pos;
    // rgb: colour, a: brightness.
    mediump vec4 light_color;
    // x: ambient, y: wrap (0.6 x size), z: cel bands (0 for smooth).
    mediump vec4 light_params;
    // x, y: -1 when the part is drawn flipped on that axis, z: 1 for a frame stored rotated.
    mediump vec4 sb_flags;
};

void main()
{
    vec4 c = texture(texture_sampler, var_texcoord0.xy);
    if (c.a <= 0.0)
    {
        out_fragColor = vec4(0.0);
        return;
    }
    // Normals are stored as (n + 1) / 2 with y up, like Defold's world.
    vec3 n = texture(normal_sampler, var_texcoord0.xy).rgb * 2.0 - 1.0;
    // A rotated frame's normals were turned clockwise with its pixels; turn them back.
    if (sb_flags.z > 0.5)
    {
        n.xy = vec2(-n.y, n.x);
    }
    n.xy *= sb_flags.xy;

    vec3 to_light = vec3(light_pos.xy - var_world, light_pos.z);
    vec3 L = normalize(to_light);
    float falloff = 1.0;
    if (light_pos.w > 0.0)
    {
        float f = clamp(1.0 - length(to_light.xy) / light_pos.w, 0.0, 1.0);
        falloff = f * f;
    }
    float wrap = light_params.y;
    float d = clamp((dot(n, L) + wrap) / (1.0 + wrap), 0.0, 1.0) * falloff;
    if (light_params.z > 1.0)
    {
        float steps = light_params.z - 1.0;
        d = floor(d * steps + 0.5) / steps;
    }
    // The sheet is premultiplied, as Defold's runtime textures are.
    vec3 C = c.rgb / c.a;
    vec3 lit = min(vec3(1.0), C * (light_params.x + light_color.a * d * light_color.rgb));
    vec4 tint_pm = vec4(tint.xyz * tint.w, tint.w);
    out_fragColor = vec4(lit * c.a, c.a) * tint_pm;
}
