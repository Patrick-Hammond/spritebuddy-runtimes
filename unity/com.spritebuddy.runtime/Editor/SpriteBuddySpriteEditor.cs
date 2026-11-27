using System;
using UnityEditor;
using UnityEngine;

namespace SpriteBuddy.Editor
{
    /// <summary>The SpriteBuddy Sprite inspector: the animation is picked from the file's list.</summary>
    [CustomEditor(typeof(SpriteBuddySprite))]
    [CanEditMultipleObjects]
    public sealed class SpriteBuddySpriteEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            serializedObject.Update();
            var property = serializedObject.GetIterator();
            var enterChildren = true;
            while (property.NextVisible(enterChildren))
            {
                enterChildren = false;
                if (property.name == "m_Script")
                {
                    using (new EditorGUI.DisabledScope(true)) EditorGUILayout.PropertyField(property);
                }
                else if (property.name == "animationName")
                {
                    AnimationField(property);
                }
                else
                {
                    EditorGUILayout.PropertyField(property, true);
                }
            }
            serializedObject.ApplyModifiedProperties();

            var sprite = (SpriteBuddySprite)target;
            if (Application.isPlaying && !serializedObject.isEditingMultipleObjects && sprite.Player != null)
            {
                EditorGUILayout.Space();
                EditorGUILayout.LabelField("Now", sprite.Animation + ", frame " + sprite.FrameIndex + " at " +
                    Math.Round(sprite.TimeMs) + " ms" + (sprite.IsPlaying ? "" : " (stopped)"));
                Repaint();
            }
        }

        /// <summary>A list of the file's animations, or a text field when there's no readable file.</summary>
        void AnimationField(SerializedProperty property)
        {
            var file = serializedObject.isEditingMultipleObjects ? null : ((SpriteBuddySprite)target).File;
            if (file == null || file.Animations.Count == 0)
            {
                EditorGUILayout.PropertyField(property);
                return;
            }
            var names = file.AnimationNames();
            var options = new GUIContent[names.Length];
            for (var i = 0; i < names.Length; i++) options[i] = new GUIContent(names[i]);
            var index = Array.IndexOf(names, property.stringValue);
            var label = new GUIContent("Animation", property.tooltip);
            var chosen = EditorGUILayout.Popup(label, Math.Max(0, index), options);
            if (chosen != index) property.stringValue = names[chosen];
        }
    }
}
