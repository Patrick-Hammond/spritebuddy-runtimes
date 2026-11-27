// Stand-ins for the parts of UnityEditor the package and examples use, with Unity's own
// signatures, so they compile without Unity. Only the compile check uses them.
using System;
using UnityEngine;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class InitializeOnLoadAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class MenuItemAttribute : Attribute
    {
        public MenuItemAttribute(string itemName) { }
    }

    [AttributeUsage(AttributeTargets.Class)]
    public sealed class CustomEditor : Attribute
    {
        public CustomEditor(Type inspectedType) { }
    }

    [AttributeUsage(AttributeTargets.Class)]
    public sealed class CanEditMultipleObjects : Attribute { }

    public static class AssetDatabase
    {
        public static string GetAssetPath(UnityEngine.Object assetObject) => "";
        public static T LoadAssetAtPath<T>(string assetPath) where T : UnityEngine.Object => null;
        public static bool IsValidFolder(string path) => false;
        public static string CreateFolder(string parentFolder, string newFolderName) => "";
        public static void CreateAsset(UnityEngine.Object asset, string path) { }
        public static void SaveAssets() { }
    }

    public static class EditorApplication
    {
        public delegate void CallbackFunction();
        public static CallbackFunction delayCall;
    }

    public class SerializedProperty
    {
        public string name => "";
        public string displayName => "";
        public string tooltip => "";
        public string stringValue { get; set; }
        public bool NextVisible(bool enterChildren) => false;
    }

    public class SerializedObject
    {
        public bool isEditingMultipleObjects => false;
        public void Update() { }
        public SerializedProperty GetIterator() => null;
        public bool ApplyModifiedProperties() => false;
    }

    public class Editor : ScriptableObject
    {
        public UnityEngine.Object target => null;
        public SerializedObject serializedObject => null;
        public virtual void OnInspectorGUI() { }
        public void Repaint() { }
    }

    public static class EditorGUI
    {
        public struct DisabledScope : IDisposable
        {
            public DisabledScope(bool disabled) { }
            public void Dispose() { }
        }
    }

    public static class EditorGUILayout
    {
        public static bool PropertyField(SerializedProperty property, params GUILayoutOption[] options) => false;
        public static bool PropertyField(SerializedProperty property, bool includeChildren, params GUILayoutOption[] options) => false;
        public static int Popup(GUIContent label, int selectedIndex, GUIContent[] displayedOptions, params GUILayoutOption[] options) => 0;
        public static void LabelField(string label, string label2, params GUILayoutOption[] options) { }
        public static void Space() { }
    }
}
