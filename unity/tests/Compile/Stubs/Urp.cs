// Stand-ins for the parts of URP the example scripts use, so they compile without Unity.
// Only the compile check uses them; Unity uses the real com.unity.render-pipelines.universal.
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityEngine.Rendering.Universal
{
    public sealed class Light2D : MonoBehaviour
    {
        public float intensity { get; set; }
        public float pointLightOuterRadius { get; set; }
        public Color color { get; set; }
    }

    public abstract class ScriptableRendererData : ScriptableObject { }

    public sealed class Renderer2DData : ScriptableRendererData { }

    public sealed class UniversalRenderPipelineAsset : RenderPipelineAsset
    {
        public static UniversalRenderPipelineAsset Create(ScriptableRendererData rendererData = null) => null;
        public override RenderPipeline CreatePipeline() => null;
    }
}
