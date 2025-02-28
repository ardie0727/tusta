from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/trendline', methods=['POST'])
def receive_trendline():
    data = request.json
    start = data.get("start")
    end = data.get("end")
    
    if start and end:
        print(f"Trendline Coordinates: Start - {start}, End - {end}")
        return jsonify({"message": "Coordinates received successfully"}), 200
    else:
        return jsonify({"error": "Invalid data"}), 400

if __name__ == '__main__':
    app.run(debug=True)
