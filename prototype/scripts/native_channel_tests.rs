use super::*;
use serde_json::json;

#[test]
fn release_list_ignores_react_channel_and_selects_native_forge_release() {
    let body = json!([
        {
            "tag_name": "v0.99.0",
            "name": "DemonX Forge React",
            "draft": false,
            "prerelease": false,
            "html_url": "https://github.com/pricklyguy/DemonX-Forge/releases/tag/v0.99.0",
            "assets": []
        },
        {
            "tag_name": "native-v0.19.9-preview.2",
            "name": "Older DemonX Forge Native Preview",
            "draft": false,
            "prerelease": true,
            "html_url": "https://github.com/pricklyguy/DemonX-Forge/releases/tag/native-v0.19.9-preview.2",
            "assets": []
        },
        {
            "tag_name": "native-v0.20.0-preview.1",
            "name": "DemonX Forge Native Preview",
            "draft": false,
            "prerelease": true,
            "html_url": "https://github.com/pricklyguy/DemonX-Forge/releases/tag/native-v0.20.0-preview.1",
            "assets": [{
                "name": "DemonX-Forge-native-windows-x64-portable.zip",
                "browser_download_url": "https://github.com/pricklyguy/DemonX-Forge/releases/download/native-v0.20.0-preview.1/DemonX-Forge-native-windows-x64-portable.zip",
                "size": 1024
            }]
        }
    ]);
    let release = Release::parse(body.to_string().as_bytes()).unwrap();
    assert_eq!(release.tag, "native-v0.20.0-preview.1");
    assert_eq!(release.version(), "0.20.0-preview.1");
    assert_eq!(release.asset_for(&InstallKind::WindowsPortable, "x86_64").map(|a| a.name.as_str()), Some("DemonX-Forge-native-windows-x64-portable.zip"));
    assert!(is_newer(&release.tag, "0.19.0"));
    assert!(!is_newer("native-v0.19.9-preview.2", "0.20.0-preview.1"), "a native downgrade is not offered");
    assert!(!is_newer("native-v0.20.0-preview.1", "0.20.0-preview.1"), "an equal version is not offered");
    assert!(!is_newer("v9.99.0", "0.20.0-preview.1"), "a higher React version is still the wrong channel");
}

#[test]
fn release_list_without_native_tag_is_not_an_update() {
    let body = json!([{
        "tag_name": "v9.9.9",
        "draft": false,
        "prerelease": false,
        "html_url": "https://github.com/pricklyguy/DemonX-Forge/releases/tag/v9.9.9",
        "assets": []
    }]);
    assert!(Release::parse(body.to_string().as_bytes()).is_err());
}
