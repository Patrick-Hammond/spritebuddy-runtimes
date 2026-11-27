using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace SpriteBuddy.Examples.Editor
{
    /// <summary>
    /// Gives the example project URP with the 2D Renderer the first time it opens, so 2D lights
    /// and normal maps work. Run it again from Tools > SpriteBuddy Examples > Set Up URP 2D.
    /// </summary>
    [InitializeOnLoad]
    static class ExampleSetup
    {
        const string Folder = "Assets/Settings";
        const string RendererPath = Folder + "/SpriteBuddy 2D Renderer.asset";
        const string PipelinePath = Folder + "/SpriteBuddy URP.asset";

        static ExampleSetup()
        {
            // After the editor has finished loading, and only if no pipeline is set yet.
            EditorApplication.delayCall += () =>
            {
                if (GraphicsSettings.defaultRenderPipeline == null) SetUp();
            };
        }

        [MenuItem("Tools/SpriteBuddy Examples/Set Up URP 2D")]
        static void SetUp()
        {
            if (!AssetDatabase.IsValidFolder(Folder)) AssetDatabase.CreateFolder("Assets", "Settings");
            var renderer = AssetDatabase.LoadAssetAtPath<Renderer2DData>(RendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<Renderer2DData>();
                AssetDatabase.CreateAsset(renderer, RendererPath);
            }
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            AssetDatabase.SaveAssets();
            Debug.Log("SpriteBuddy examples: using URP with the 2D Renderer (" + PipelinePath + ").");
        }
    }
}
