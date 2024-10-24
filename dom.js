// 这个脚本用来添加dom
document.addEventListener('DOMContentLoaded', () => {  
    console.log('Script loaded and DOM fully parsed and ready');  
    // alert('Hello from external script!');  
    let buttons = document.getElementById("select-folder")
    // alert(window.electron)
    buttons.addEventListener('click',function() {
        window.electron.openDirectory()
        alert("你点击了")
    })
});